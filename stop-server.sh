#!/bin/bash

# Script para detener el servidor ALA Data Service

echo "🛑 Deteniendo ALA Data Service..."

# Buscar y matar procesos en el puerto 3001
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "Encontrado proceso en puerto 3001, deteniendo..."
    lsof -ti:3001 | xargs kill -9 2>/dev/null
    sleep 1
    echo "✅ Servidor detenido"
else
    echo "ℹ️  No hay servidor corriendo en el puerto 3001"
fi

