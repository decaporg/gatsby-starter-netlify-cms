#!/bin/bash

# Turn off Bluetooth
sudo systemctl stop bluetooth
sudo systemctl disable bluetooth

# Turn off Wi-Fi
sudo ifconfig wlan0 down
sudo systemctl disable wpa_supplicant

echo "Bluetooth and Wi-Fi are turned off."
