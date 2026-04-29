import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDVrTZ4h76uocgzsu5tCXl0femcNGbxNqc",
    authDomain: "pagos-restaurante-pro.firebaseapp.com",
    projectId: "pagos-restaurante-pro",
    storageBucket: "pagos-restaurante-pro.firebasestorage.app",
    messagingSenderId: "679734450030",
    appId: "1:679734450030:web:9ba2cb5d1827e290e0137f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let carpetaIdActual = null;

// --- SISTEMA DE NOTIFICACIONES ---
function notify(mensaje, tipo = "success") {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    const icon = tipo === "success" ? "fa-check-circle" : "fa-exclamation-triangle";
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${mensaje}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- LÓGICA DE ACCESO (CORREGIDA) ---
window.login = async () => {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    if(!email || !pass) return alert("Completa los datos");
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        window.location.replace("index.html"); 
    } catch (e) { alert("Error: " + e.message); }
};

window.registro = async () => {
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    if(!email || !pass) return alert("Completa los datos");
    try {
        await createUserWithEmailAndPassword(auth, email, pass);
        window.location.replace("index.html");
    } catch (e) { alert("Error: " + e.message); }
};

window.cerrarSesion = async () => {
    try {
        await signOut(auth);
        // Forzamos la redirección al login tras cerrar sesión
        window.location.replace("login.html");
    } catch (e) {
        console.error("Error al cerrar sesión:", e);
    }
};

// --- GESTIÓN DE CARPETAS ---
window.crearCarpeta = async () => {
    const nombre = document.getElementById('nombre-mes').value;
    if (!nombre) return notify("Escribe un nombre", "danger");
    try {
        await addDoc(collection(db, "carpetas"), { nombre, uid: auth.currentUser.uid, fecha: new Date() });
        document.getElementById('nombre-mes').value = "";
        notify("Carpeta creada correctamente");
        cargarCarpetas();
    } catch (e) { notify(e.message, "danger"); }
};

// --- GESTIÓN DE CARPETAS MEJORADA ---

window.cargarCarpetas = async () => {
    const lista = document.getElementById('lista-carpetas');
    if (!lista) return;
    lista.innerHTML = '<div style="text-align:center">Cargando...</div>';
    
    try {
        const q = query(collection(db, "carpetas"), where("uid", "==", auth.currentUser.uid), orderBy("fecha", "desc"));
        const snapshot = await getDocs(q);
        lista.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;

            const div = document.createElement('div');
            div.style = "background: white; border: 1px solid #e2e8f0; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; padding: 10px 15px; margin-bottom: 10px;";
            
            div.innerHTML = `
                <div onclick="abrirCarpeta('${id}', '${data.nombre}')" style="cursor: pointer; display: flex; align-items: center; gap: 10px; flex: 1;">
                    <i class="fas fa-folder" style="color: #f59e0b; font-size: 1.2rem;"></i>
                    <span style="font-weight: bold;">${data.nombre}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-icon" title="Editar Nombre" onclick="abrirModalCarpeta('${id}', '${data.nombre}')">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="btn-icon btn-delete" title="Eliminar Todo" onclick="eliminarCarpetaCompleta('${id}', '${data.nombre}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            lista.appendChild(div);
        });
    } catch (e) { notify("Error al cargar: " + e.message, "danger"); }
};

// --- FUNCIONES PARA EDITAR CARPETA ---
window.abrirModalCarpeta = (id, nombre) => {
    document.getElementById('edit-carpeta-id').value = id;
    document.getElementById('edit-carpeta-nombre').value = nombre;
    document.getElementById('modalEditarCarpeta').style.display = 'flex';
};

window.cerrarModalCarpeta = () => {
    document.getElementById('modalEditarCarpeta').style.display = 'none';
};

window.actualizarCarpeta = async () => {
    // Corregido: Usamos 'edit-carpeta-id' que es el que está en el HTML
    const id = document.getElementById('edit-carpeta-id').value;
    const nuevoNombre = document.getElementById('edit-carpeta-nombre').value;
    
    if(!nuevoNombre) {
        return notify("El nombre no puede estar vacío", "danger");
    }

    try {
        await updateDoc(doc(db, "carpetas", id), { 
            nombre: nuevoNombre 
        });
        
        notify("Nombre actualizado");
        cerrarModalCarpeta();
        cargarCarpetas(); // Recarga la lista para ver el cambio
    } catch (e) { 
        console.error(e);
        notify("Error al actualizar: " + e.message, "danger"); 
    }
};

// --- ELIMINAR CARPETA Y SUS JORNADAS (CASCADA) ---
window.eliminarCarpetaCompleta = async (id, nombre) => {
    const confirmacion = confirm(`¿ESTÁS SEGURO? \nSe borrará la carpeta "${nombre}" y TODAS las jornadas registradas en ella. Esta acción no se puede deshacer.`);
    
    if (!confirmacion) return;

    try {
        // 1. Obtener y borrar todas las jornadas dentro de la carpeta
        const jornadasRef = collection(db, "carpetas", id, "jornadas");
        const jornadasSnap = await getDocs(jornadasRef);
        
        const promesasBorrado = jornadasSnap.docs.map(jDoc => deleteDoc(doc(db, "carpetas", id, "jornadas", jDoc.id)));
        await Promise.all(promesasBorrado);

        // 2. Borrar la carpeta principal
        await deleteDoc(doc(db, "carpetas", id));
        
        notify("Carpeta y registros eliminados", "danger");
        cargarCarpetas();
    } catch (e) { notify("Error al eliminar: " + e.message, "danger"); }
};

window.abrirCarpeta = (id, nombre) => {
    carpetaIdActual = id;
    document.getElementById('view-carpetas').style.display = 'none';
    document.getElementById('view-calculadora').style.display = 'block';
    document.getElementById('titulo-carpeta').innerText = nombre;
    renderizarJornadas();
};

window.regresarACarpetas = () => {
    document.getElementById('view-carpetas').style.display = 'block';
    document.getElementById('view-calculadora').style.display = 'none';
    cargarCarpetas();
};

// --- GESTIÓN DE JORNADAS ---
window.guardarRegistro = async () => {
    const fecha = document.getElementById('fecha').value;
    const entrada = document.getElementById('entrada').value;
    const salida = document.getElementById('salida').value;
    const valorHora = parseFloat(document.getElementById('valor-hora-config').value);
    const adi = parseFloat(document.getElementById('adicional').value) || 0;
    const desc = parseFloat(document.getElementById('descuento').value) || 0;
    const nota = document.getElementById('nota').value;

    if (!fecha || !entrada || !salida) return notify("Completa los campos", "danger");

    let [h1, m1] = entrada.split(':').map(Number);
    let [h2, m2] = salida.split(':').map(Number);
    let min1 = h1 * 60 + m1;
    let min2 = h2 * 60 + m2;
    let diff = min2 - min1;
    if (diff < 0) diff += 1440;

    const pagoBase = (diff / 60) * valorHora;
    const totalDia = (pagoBase + adi - desc).toFixed(2);
    const tiempoTexto = `${Math.floor(diff / 60)}h ${diff % 60}m`;

    try {
        await addDoc(collection(db, "carpetas", carpetaIdActual, "jornadas"), {
            fecha, entrada, salida, valorHora, adicional: adi, descuento: desc, nota,
            totalDia, tiempoTexto, minutos: diff, pagoBase: pagoBase.toFixed(2), creado: new Date()
        });
        notify("Jornada guardada");
        renderizarJornadas();
    } catch (e) { notify(e.message, "danger"); }
};

window.renderizarJornadas = async () => {
    const cuerpo = document.getElementById('cuerpoTabla');
    if(!cuerpo) return;
    cuerpo.innerHTML = '<tr><td colspan="6" style="text-align:center">Cargando...</td></tr>';
    
    const q = query(collection(db, "carpetas", carpetaIdActual, "jornadas"), orderBy("fecha", "desc"));
    const snapshot = await getDocs(q);
    cuerpo.innerHTML = "";
    
    let totalD = 0, totalM = 0;

    snapshot.forEach(docSnap => {
        const r = docSnap.data();
        totalD += parseFloat(r.totalDia);
        totalM += r.minutos;
        
        let ajustes = "";
        if(r.adicional > 0) ajustes += `<span style="color:var(--success); font-weight:bold;">+$${r.adicional}</span> `;
        if(r.descuento > 0) ajustes += `<span style="color:var(--danger); font-weight:bold;">-$${r.descuento}</span>`;

        cuerpo.innerHTML += `
            <tr>
                <td><b>${r.fecha}</b><br><small>${r.entrada} - ${r.salida}</small></td>
                <td>${r.tiempoTexto}</td>
                <td>$${r.pagoBase} <small>($${r.valorHora}/h)</small></td>
                <td>${ajustes}<br><small style="color:#64748b">${r.nota || ''}</small></td>
                <td style="color:var(--primary); font-weight:900;">$${r.totalDia}</td>
                <td class="no-print action-btns">
                    <button class="btn-icon" onclick="abrirModalEditar('${docSnap.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon btn-delete" onclick="eliminarRegistro('${docSnap.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    });

    document.getElementById('totalHorasAcumuladas').innerText = `${Math.floor(totalM / 60)}h ${totalM % 60}m`;
    document.getElementById('totalAcumulado').innerText = `$${totalD.toFixed(2)}`;
};

// --- MODAL Y EDICIÓN ---
window.abrirModalEditar = async (id) => {
    const docRef = doc(db, "carpetas", carpetaIdActual, "jornadas", id);
    const docSnap = await getDoc(docRef);
    const data = docSnap.data();

    document.getElementById('edit-id').value = id;
    document.getElementById('edit-fecha').value = data.fecha;
    document.getElementById('edit-entrada').value = data.entrada;
    document.getElementById('edit-salida').value = data.salida;
    document.getElementById('edit-adicional').value = data.adicional;
    document.getElementById('edit-descuento').value = data.descuento;
    document.getElementById('edit-valorHora').value = data.valorHora;
    document.getElementById('edit-nota').value = data.nota;

    document.getElementById('modalEditar').style.display = 'flex';
};

window.cerrarModal = () => document.getElementById('modalEditar').style.display = 'none';

window.actualizarRegistro = async () => {
    const id = document.getElementById('edit-id').value;
    const fecha = document.getElementById('edit-fecha').value;
    const entrada = document.getElementById('edit-entrada').value;
    const salida = document.getElementById('edit-salida').value;
    const valorHora = parseFloat(document.getElementById('edit-valorHora').value);
    const adi = parseFloat(document.getElementById('edit-adicional').value) || 0;
    const desc = parseFloat(document.getElementById('edit-descuento').value) || 0;
    const nota = document.getElementById('edit-nota').value;

    let [h1, m1] = entrada.split(':').map(Number);
    let [h2, m2] = salida.split(':').map(Number);
    let min1 = h1 * 60 + m1;
    let min2 = h2 * 60 + m2;
    let diff = min2 - min1;
    if (diff < 0) diff += 1440;

    const pagoBase = (diff / 60) * valorHora;
    const totalDia = (pagoBase + adi - desc).toFixed(2);

    try {
        await updateDoc(doc(db, "carpetas", carpetaIdActual, "jornadas", id), {
            fecha, entrada, salida, valorHora, adicional: adi, descuento: desc, nota,
            totalDia, tiempoTexto: `${Math.floor(diff / 60)}h ${diff % 60}m`, minutos: diff, pagoBase: pagoBase.toFixed(2)
        });
        notify("Registro actualizado");
        cerrarModal();
        renderizarJornadas();
    } catch (e) { notify(e.message, "danger"); }
};

window.eliminarRegistro = async (id) => {
    if (!confirm("¿Eliminar jornada?")) return;
    try {
        await deleteDoc(doc(db, "carpetas", carpetaIdActual, "jornadas", id));
        notify("Registro eliminado", "danger");
        renderizarJornadas();
    } catch (e) { notify(e.message, "danger"); }
};

// --- OBSERVADOR (CORREGIDO PARA EVITAR BUCLES) ---
// Reemplaza tu onAuthStateChanged por este en app.js
onAuthStateChanged(auth, (user) => {
    const path = window.location.pathname;
    // Verificamos si estamos en login buscando la palabra en la URL
    const enLogin = path.includes("login.html");

    if (user) {
        // Si hay usuario y estoy en login, voy a index
        if (enLogin) {
            window.location.replace("index.html");
        }
        // Actualizamos UI y cargamos datos
        if (document.getElementById('user-email')) {
            document.getElementById('user-email').innerText = user.email;
            cargarCarpetas();
        }
    } else {
        // Si NO hay usuario y NO estoy en login, mando a login
        if (!enLogin) {
            window.location.replace("login.html");
        }
    }
});