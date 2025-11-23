#!/bin/bash

# Script para iniciar el servidor ALA Data Service

echo "🚀 Iniciando ALA Data Service..."
echo ""

# Cambiar al directorio del servidor
cd "$(dirname "$0")"

# Verificar si el puerto 3001 está en uso
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  El puerto 3001 está en uso. Deteniendo proceso anterior..."
    lsof -ti:3001 | xargs kill -9 2>/dev/null
    sleep 2
fi

# Iniciar el servidor
echo "✅ Iniciando servidor en puerto 3001..."
node server.js

