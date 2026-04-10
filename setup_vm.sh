#!/bin/bash

# Exit on error
set -e

echo "[1/5] Updating system packages..."
sudo apt update && sudo apt upgrade -y

echo "[2/5] Installing Docker and Docker Compose..."
sudo apt install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group if not already added
if ! getent group docker | grep -q "\b$USER\b"; then
    echo "Adding $USER to docker group..."
    sudo usermod -aG docker $USER
    echo "NOTICE: You might need to log out and log back in for docker group changes to take effect."
fi

echo "[3/5] Installing Node.js 20 for local utilities..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "[4/5] Preparing environment..."
# Check if sessions directory exists
mkdir -p backend/sessions

echo "[5/5] Starting the application with Docker Compose..."
sudo docker-compose up -d --build

echo "===================================================="
echo "   YZ_Almotakamel is now deploying!"
echo "   Frontend: http://34.56.31.100:8085"
echo "   Backend API: http://34.56.31.100:5005"
echo "===================================================="
echo "   Use 'sudo docker-compose logs -f' to see status."
