import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// IMPORTANTE: Consumimos la base de datos ya inicializada en app.js
import { db } from "./app.js"; 

let miGraficoLineas = null;
let statsCarpetaId = null;

window.abrirEstadisticas = (id, nombreCarpeta) => {
    statsCarpetaId = id;
    
    const tituloStats = document.getElementById('titulo-stats-carpeta');
    if (tituloStats) tituloStats.innerText = `ESTADÍSTICAS DE: ${nombreCarpeta.toUpperCase()}`;
    
    document.getElementById('view-carpetas').style.display = 'none';
    document.getElementById('view-estadisticas').style.display = 'block';
    
    generarEstadisticasDashboard();
};

window.regresarACarpetasDesdeStats = () => {
    statsCarpetaId = null;
    document.getElementById('view-estadisticas').style.display = 'none';
    document.getElementById('view-carpetas').style.display = 'block';
};

// Función auxiliar matemática para obtener los límites (Lunes a Domingo) de cualquier fecha
function obtenerLimitesSemana(fechaStr) {
    const fecha = new Date(fechaStr + "T00:00:00");
    const diaSemana = fecha.getDay(); 
    const distanciaAlLunes = diaSemana === 0 ? 6 : diaSemana - 1;
    
    const lunes = new Date(fecha);
    lunes.setDate(fecha.getDate() - distanciaAlLunes);
    lunes.setHours(0,0,0,0);
    
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    domingo.setHours(23,59,59,999);
    
    return { lunes, domingo };
}

async function generarEstadisticasDashboard() {
    if (!statsCarpetaId) return;

    try {
        const q = query(collection(db, "carpetas", statsCarpetaId, "jornadas"), orderBy("fecha", "asc"));
        const snapshot = await getDocs(q);
        
        let netoTotal = 0;
        let minutosTotales = 0;
        let diasTrabajados = 0; // Conteo de asistencias estético
        let adicionalesTotales = 0;
        let descuentosTotales = 0;
        let diaMaxGanancia = "";
        let maxGananciaDia = 0;
        
        const mapeoFechas = {};       // Para el gráfico lineal
        const registroSemanas = {};   // Para la nueva tabla de historial por semanas

        const diasSemanaCorto = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const totalDia = parseFloat(data.totalDia) || 0;
            const mins = parseInt(data.minutos) || 0;
            const adi = parseFloat(data.adicional) || 0;
            const desc = parseFloat(data.descuento) || 0;
            
            netoTotal += totalDia;
            minutosTotales += mins;
            adicionalesTotales += adi;
            descuentosTotales += desc;
            
            // Cada documento recuperado suma una asistencia
            diasTrabajados++;

            if (data.fecha) {
                // AGRUPACIÓN DINÁMICA DE TODAS LAS SEMANAS (HISTORIAL)
                const { lunes, domingo } = obtenerLimitesSemana(data.fecha);
                
                // Creamos una clave única usando la fecha del lunes (ej: "2026-05-11")
                const claveSemana = lunes.toISOString().split('T')[0];
                
                // Formato legible para el usuario (ej: "Del 11/5 al 17/5")
                const textoRango = `Del ${lunes.getDate()}/${lunes.getMonth()+1} al ${domingo.getDate()}/${domingo.getMonth()+1}`;

                if (!registroSemanas[claveSemana]) {
                    registroSemanas[claveSemana] = {
                        rangoTexto: textoRango,
                        minutos: 0,
                        ganancia: 0,
                        ordenFecha: lunes // Guardamos objeto fecha para ordenar correctamente
                    };
                }
                registroSemanas[claveSemana].minutos += mins;
                registroSemanas[claveSemana].ganancia += totalDia;
            }

            if (totalDia > maxGananciaDia) {
                maxGananciaDia = totalDia;
                diaMaxGanancia = data.fecha;
            }

            // Datos para el gráfico lineal diario
            const [year, month, day] = data.fecha.split("-").map(Number);
            const objetoFecha = new Date(Date.UTC(year, month - 1, day));
            const nombreDia = diasSemanaCorto[objetoFecha.getUTCDay()];
            const etiquetaDescriptiva = `${nombreDia} ${day}`; 

            mapeoFechas[etiquetaDescriptiva] = (mapeoFechas[etiquetaDescriptiva] || 0) + totalDia;
        });

        // Renderizar KPIs en pantalla
        document.getElementById('dash-neto').innerText = `$${netoTotal.toFixed(2)}`;
        document.getElementById('dash-horas').innerText = `${Math.floor(minutosTotales / 60)}h ${minutosTotales % 60}m`;
        document.getElementById('dash-asistencias').innerText = `${diasTrabajados} ${diasTrabajados === 1 ? 'día' : 'días'}`;
        
        if (diaMaxGanancia) {
            const partes = diaMaxGanancia.split("-");
            document.getElementById('dash-dia-top').innerText = `${partes[2] || ''}/${partes[1] || ''} ($${maxGananciaDia.toFixed(1)})`;
        } else {
            document.getElementById('dash-dia-top').innerText = "--";
        }
        
        const extrasNetos = adicionalesTotales - descuentosTotales;
        const tarjetaExtras = document.getElementById('dash-extras');
        if (tarjetaExtras) {
            tarjetaExtras.innerText = (extrasNetos >= 0 ? "+" : "") + `$${extrasNetos.toFixed(2)}`;
            tarjetaExtras.parentElement.style.borderLeftColor = extrasNetos >= 0 ? "var(--success)" : "var(--danger)";
        }

        // --- RENDERIZAR LA TABLA DE HISTORIAL POR SEMANAS ---
        const tablaCuerpo = document.getElementById('tabla-semanas-cuerpo');
        if (tablaCuerpo) {
            tablaCuerpo.innerHTML = "";
            
            // Ordenamos las semanas de la más reciente a la más antigua
            const semanasOrdenadas = Object.values(registroSemanas).sort((a, b) => b.ordenFecha - a.ordenFecha);
            
            if (semanasOrdenadas.length === 0) {
                tablaCuerpo.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:#94a3b8;">No hay jornadas registradas.</td></tr>`;
            } else {
                semanasOrdenadas.forEach(sem => {
                    const hrs = Math.floor(sem.minutos / 60);
                    const mns = sem.minutos % 60;
                    
                    const fila = document.createElement('tr');
                    fila.style.borderBottom = "1px solid #e2e8f0";
                    fila.innerHTML = `
                        <td style="padding: 12px; font-weight: 500; color: #1e293b;">${sem.rangoTexto}</td>
                        <td style="padding: 12px; color: #334155;"><span style="background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 6px; font-size: 0.85rem; font-weight: bold;">${hrs}h ${mns}m</span></td>
                        <td style="padding: 12px; font-weight: bold; color: #16a34a;">$${sem.ganancia.toFixed(2)}</td>
                    `;
                    tablaCuerpo.appendChild(fila);
                });
            }
        }

        // --- DIBUJO DEL GRÁFICO LINEAL ---
        const ejeX_etiquetas = Object.keys(mapeoFechas);
        const ejeY_ganancias = Object.values(mapeoFechas);
        const ctx = document.getElementById('graficoLineas').getContext('2d');
        
        if (miGraficoLineas) {
            miGraficoLineas.destroy();
        }

        miGraficoLineas = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ejeX_etiquetas,
                datasets: [{
                    label: 'Ganancia',
                    data: ejeY_ganancias,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.08)',
                    borderWidth: 3,
                    tension: 0.2, 
                    fill: true,
                    pointBackgroundColor: '#ffffff', 
                    pointBorderColor: '#2563eb',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointHoverBackgroundColor: '#2563eb'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 13 },
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: { label: function(context) { return ` Ganado: $${context.parsed.y.toFixed(2)}`; } }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: '#f1f5f9' },
                        ticks: { callback: function(value) { return '$' + value; }, color: '#64748b' }
                    },
                    x: { 
                        grid: { display: false },
                        ticks: { color: '#64748b', font: { weight: 'bold' } }
                    }
                }
            }
        });
    } catch (e) { console.error("Error al compilar el dashboard:", e); }
}