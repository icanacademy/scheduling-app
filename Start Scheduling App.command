#!/bin/bash

# ICAN Scheduling App Startup Script
# Double-click this file to start both backend and frontend servers

# Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "🚀 Starting ICAN Scheduling App..."
echo "=================================="
echo ""

# Start Cloudflare tunnel if not already running
if ! pgrep -f "cloudflared tunnel run cosmodrive" > /dev/null 2>&1; then
    echo "🌐 Starting Cloudflare Tunnel..."
    cloudflared tunnel run cosmodrive &
    sleep 2
    echo "✅ Cloudflare Tunnel started"
else
    echo "🌐 Cloudflare Tunnel already running"
fi
echo ""

# Check for port 5432 conflicts (Homebrew PostgreSQL)
echo "🔍 Checking for port conflicts..."
if lsof -i :5432 | grep -q "postgres.*Homebrew"; then
    echo "⚠️  Detected Homebrew PostgreSQL on port 5432"
    echo "   Stopping it to avoid conflicts..."
    brew services stop postgresql@15 2>/dev/null
    pkill -f "/opt/homebrew.*postgres" 2>/dev/null
    sleep 2
    echo "✅ Homebrew PostgreSQL stopped"
fi

# Check if Docker PostgreSQL is running
echo "📊 Checking Docker PostgreSQL..."
if docker ps --filter "name=scheduling_db" --filter "health=healthy" --format "{{.Names}}" | grep -q scheduling_db; then
    echo "✅ Docker PostgreSQL is running"
else
    echo "⚠️  Docker PostgreSQL is not running. Starting it now..."
    cd "$DIR"
    docker compose up -d
    echo "⏳ Waiting for database to be healthy..."
    sleep 5
fi

echo ""
echo "🔧 Starting Backend Server (Port 5555)..."
cd "$DIR/server"
npm run dev > /tmp/scheduling-backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID)"

echo ""
echo "🎨 Starting Frontend Server (Port 4444)..."
cd "$DIR/client"
npm run dev > /tmp/scheduling-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend started (PID: $FRONTEND_PID)"

# Wait for servers to start
echo ""
echo "⏳ Waiting for servers to initialize..."
sleep 5

# Check if servers are running
if kill -0 $BACKEND_PID 2>/dev/null && kill -0 $FRONTEND_PID 2>/dev/null; then
    echo ""
    echo "=================================="
    echo "✅ ICAN Scheduling App is running!"
    echo "=================================="
    echo ""
    echo "📍 Access your app at:"
    echo "   This computer: http://localhost:4444"
    echo "   Other computers: http://192.168.68.106:4444"
    echo "   Public URL:      https://scheduler.icanacademy.work"
    echo ""
    echo "Backend: http://192.168.68.106:5555/api"
    echo "Frontend: http://192.168.68.106:4444"
    echo ""
    echo "💡 Logs saved to:"
    echo "   Backend:  /tmp/scheduling-backend.log"
    echo "   Frontend: /tmp/scheduling-frontend.log"
    echo ""
    echo "🌐 Opening app in your browser..."
    sleep 2
    open http://localhost:4444
    echo ""
    echo "✋ Press Ctrl+C to stop all servers"
    echo ""

    # Keep script running and handle Ctrl+C
    trap "echo ''; echo '🛑 Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '✅ Servers stopped'; exit 0" INT

    # Wait indefinitely
    wait
else
    echo ""
    echo "❌ Error: Servers failed to start"
    echo "Check logs at:"
    echo "   /tmp/scheduling-backend.log"
    echo "   /tmp/scheduling-frontend.log"
    exit 1
fi
