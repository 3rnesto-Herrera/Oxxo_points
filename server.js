const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'usuarios.json');
const BACKUP_DIR = path.join(__dirname, 'backups');

// Asegurar que la carpeta de respaldos exista en el proyecto
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
}

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de sesiones para el Gerente
app.use(session({
    secret: 'oxxo_secret_key_gerente_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 60 * 1000 } // Expira en 30 minutos de inactividad
}));

// ==========================================
// SISTEMA DE RESPALDO CON FECHA Y HORA (VS CODE)
// ==========================================

function crearRespaldo() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const ahora = new Date();
            const fechaIso = ahora.toISOString().replace(/:/g, '-').replace(/\..+/, ''); 
            const backupFileName = `usuarios_respaldo_${fechaIso}.json`;
            const backupPath = path.join(BACKUP_DIR, backupFileName);

            fs.copyFileSync(DATA_FILE, backupPath);
            console.log(`[SISTEMA] Respaldo independiente creado: ${backupFileName}`);
        }
    } catch (error) {
        console.error("[ERROR] No se pudo generar el respaldo automático:", error);
    }
}

// Funciones auxiliares para leer y escribir en usuarios.json con tolerancia a fallos
function leerUsuarios() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    try {
        if (!data.trim()) {
            throw new Error("El archivo usuarios.json está vacío.");
        }
        return JSON.parse(data);
    } catch (error) {
        console.warn("[ADVERTENCIA] usuarios.json está corrupto o vacío. Buscando el respaldo más reciente en la carpeta 'backups'...");
        try {
            if (fs.existsSync(BACKUP_DIR)) {
                const archivos = fs.readdirSync(BACKUP_DIR)
                    .filter(f => f.startsWith('usuarios_respaldo_') && f.endsWith('.json'))
                    .sort()
                    .reverse();

                if (archivos.length > 0) {
                    const archivoMasReciente = path.join(BACKUP_DIR, archivos[0]);
                    fs.copyFileSync(archivoMasReciente, DATA_FILE);
                    const backupData = fs.readFileSync(DATA_FILE, 'utf8');
                    console.log(`[SISTEMA] Recuperación exitosa utilizando el respaldo: ${archivos[0]}`);
                    return JSON.parse(backupData);
                }
            }
        } catch (backupError) {
            console.error("[ERROR CRÍTICO] Falló la recuperación del respaldo:", backupError);
        }
        return [];
    }
}

function guardarUsuarios(usuarios) {
    crearRespaldo(); // Genera un archivo de respaldo nuevo e independiente antes de sobrescribir
    fs.writeFileSync(DATA_FILE, JSON.stringify(usuarios, null, 2));
}

// Respaldo automático inicial al arrancar el servidor
crearRespaldo();

// ==========================================
// RUTAS WEB Y VISTAS DE OPERACIÓN
// ==========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/compras', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'compras.html'));
});

app.get('/registro', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'registro.html'));
});

app.get('/modificar', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'modificar.html'));
});

app.get('/eliminar', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'eliminar.html'));
});

// ==========================================
// SEGURIDAD Y ACCESO GERENCIAL
// ==========================================

// Middleware para verificar si el usuario tiene sesión de Gerente activa
function verificarGerente(req, res, next) {
    if (req.session && req.session.esGerente) {
        return next();
    }
    if (req.path.startsWith('/api/') && req.path !== '/api/login-gerente') {
        return res.status(401).json({ exito: false, mensaje: 'No autorizado. Inicie sesión como gerente.' });
    }
    res.redirect('/login-gerente');
}

// Vista de Login del Gerente
app.get('/login-gerente', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login-gerente.html'));
});

// Endpoint POST para validar la contraseña de gerencia
app.post('/api/login-gerente', (req, res) => {
    const { password } = req.body;
    const PASSWORD_GERENTE = 'oxxo2026'; // Puedes cambiar esta contraseña si lo deseas

    if (password === PASSWORD_GERENTE) {
        req.session.esGerente = true;
        return res.json({ exito: true, mensaje: 'Acceso autorizado' });
    } else {
        return res.status(401).json({ exito: false, mensaje: 'Contraseña incorrecta' });
    }
});

// Ruta para cerrar sesión del gerente
app.get('/logout-gerente', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login-gerente');
    });
});

// 📌 RUTA PROTEGIDA DE LA BASE DE DATOS
app.get('/database', verificarGerente, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'database.html'));
});


// ==========================================
// ENDPOINTS DE LA API (OPERADOR Y GERENCIA)
// ==========================================

// 1. Obtener listado de usuarios
app.get('/api/usuarios', (req, res) => {
    const usuarios = leerUsuarios();
    res.json({ exito: true, usuarios });
});

// 2. Consultar usuario por correo
app.get('/api/usuario/:correo', (req, res) => {
    const correoBuscado = req.params.correo.toLowerCase();
    const usuarios = leerUsuarios();
    const usuario = usuarios.find(u => u.correo.toLowerCase() === correoBuscado);

    if (usuario) {
        res.json({ exito: true, usuario });
    } else {
        res.status(404).json({ exito: false, mensaje: 'Usuario no encontrado' });
    }
});

// Función de validación de correo
function esCorreoValido(correo) {
    if (!correo) return false;
    // Verifica que tenga caracteres válidos antes del @ y termine exactamente en @gmail.com
    const regexGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    return regexGmail.test(correo.trim());
}

// 3. Registrar nuevo usuario
app.post('/api/registrar', (req, res) => {
    const { nombre, correo } = req.body;

    if (!nombre || !correo) {
        return res.status(400).json({ exito: false, mensaje: 'Nombre y correo son obligatorios' });
    }

    // Validación de formato de correo
    if (!esCorreoValido(correo.trim())) {
        return res.status(400).json({ exito: false, mensaje: 'Ingrese una dirección de correo electrónico válida (ejemplo: usuario@dominio.com).' });
    }

    let usuarios = leerUsuarios();
    const existe = usuarios.some(u => u.correo.toLowerCase() === correo.trim().toLowerCase());

    if (existe) {
        return res.status(400).json({ exito: false, mensaje: 'El correo electrónico ya está registrado.' });
    }

    const nuevoUsuario = {
        nombre: nombre.trim(),
        correo: correo.trim(),
        puntos: 0,
        fechaRegistro: new Date().toISOString()
    };

    usuarios.push(nuevoUsuario);
    guardarUsuarios(usuarios);

    res.json({ exito: true, mensaje: 'Usuario registrado exitosamente', usuario: nuevoUsuario });
});

app.post('/api/compras', (req, res) => {
    const { correo, tipoAccion, montoTotal, puntosAGastar } = req.body;
    let usuarios = leerUsuarios();

    // Si se proporciona un correo, validamos y acumulamos/redimimos puntos
    if (correo && correo.trim() !== '') {
        const index = usuarios.findIndex(u => u.correo.toLowerCase() === correo.trim().toLowerCase());

        if (index === -1) {
            return res.status(404).json({ exito: false, mensaje: 'Usuario no encontrado' });
        }

        let usuario = usuarios[index];

        if (tipoAccion === 'acumular') {
            const monto = parseFloat(montoTotal);
            if (isNaN(monto) || monto <= 0) {
                return res.status(400).json({ exito: false, mensaje: 'Monto de compra inválido' });
            }
            const puntosGanados = Math.floor(monto * 0.05);
            usuario.puntos += puntosGanados;
            guardarUsuarios(usuarios);
            return res.json({ exito: true, mensaje: `Compra registrada. ¡El usuario ganó ${puntosGanados} puntos!`, puntosTotales: usuario.puntos });
        } 
        else if (tipoAccion === 'gastar') {
            const puntosRedimir = parseInt(puntosAGastar);
            if (isNaN(puntosRedimir) || puntosRedimir <= 0) {
                return res.status(400).json({ exito: false, mensaje: 'Cantidad de puntos inválida' });
            }
            if (usuario.puntos < puntosRedimir) {
                return res.status(400).json({ exito: false, mensaje: 'El usuario no tiene suficientes puntos.' });
            }
            usuario.puntos -= puntosRedimir;
            guardarUsuarios(usuarios);
            return res.json({ exito: true, mensaje: `Redención exitosa de ${puntosRedimir} puntos.`, puntosTotales: usuario.puntos });
        }
    } 
    
    // Si NO se proporciona correo, la compra se realiza de manera estándar sin puntos
    const monto = parseFloat(montoTotal);
    if (isNaN(monto) || monto <= 0) {
        return res.status(400).json({ exito: false, mensaje: 'Monto de compra inválido' });
    }

    return res.json({ exito: true, mensaje: '¡Compra realizada con éxito sin asociar puntos!' });
});

// 5. Modificar datos de usuario (Protegido para Gerente)
app.put('/api/modificar', verificarGerente, (req, res) => {
    const { correoOriginal, nuevoNombre, nuevoCorreo } = req.body;

    if (!nuevoNombre || !nuevoCorreo) {
        return res.status(400).json({ exito: false, mensaje: 'Nombre y correo son obligatorios.' });
    }

    // Validación de formato de correo
    if (!esCorreoValido(nuevoCorreo.trim())) {
        return res.status(400).json({ exito: false, mensaje: 'El formato del nuevo correo no es válido (ejemplo: usuario@dominio.com).' });
    }

    let usuarios = leerUsuarios();
    const index = usuarios.findIndex(u => u.correo.toLowerCase() === correoOriginal.trim().toLowerCase());

    if (index === -1) {
        return res.status(404).json({ exito: false, mensaje: 'Usuario no encontrado' });
    }

    const correoOcupado = usuarios.some((u, idx) => idx !== index && u.correo.toLowerCase() === nuevoCorreo.trim().toLowerCase());
    if (correoOcupado) {
        return res.status(400).json({ exito: false, mensaje: 'El nuevo correo ya está registrado por otro usuario.' });
    }

    usuarios[index].nombre = nuevoNombre.trim();
    usuarios[index].correo = nuevoCorreo.trim();
    guardarUsuarios(usuarios);

    res.json({ exito: true, mensaje: 'Datos modificados exitosamente' });
});

// 6. Modificar puntos directamente (Protegido para Gerente)
app.put('/api/modificar-puntos', verificarGerente, (req, res) => {
    const { correo, puntos } = req.body;
    const nuevosPuntos = parseInt(puntos);

    if (!correo || isNaN(nuevosPuntos) || nuevosPuntos < 0) {
        return res.status(400).json({ exito: false, mensaje: 'Datos inválidos para actualizar los puntos.' });
    }

    let usuarios = leerUsuarios();
    const index = usuarios.findIndex(u => u.correo.toLowerCase() === correo.trim().toLowerCase());

    if (index === -1) {
        return res.status(404).json({ exito: false, mensaje: 'Usuario no encontrado.' });
    }

    usuarios[index].puntos = nuevosPuntos;
    guardarUsuarios(usuarios);

    return res.json({ exito: true, mensaje: 'Puntos actualizados exitosamente.' });
});

// 7. Eliminar usuario (Protegido para Gerente)
app.delete('/api/eliminar/:correo', verificarGerente, (req, res) => {
    const correoBuscado = req.params.correo.toLowerCase();
    let usuarios = leerUsuarios();
    const initialLength = usuarios.length;

    usuarios = usuarios.filter(u => u.correo.toLowerCase() !== correoBuscado);

    if (usuarios.length === initialLength) {
        return res.status(404).json({ exito: false, mensaje: 'Usuario no encontrado en la base de datos.' });
    }

    guardarUsuarios(usuarios);
    res.json({ exito: true, mensaje: 'Registro eliminado exitosamente de la base de datos.' });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor de OXXO Points ejecutándose en http://localhost:${PORT}`);
});