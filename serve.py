#!/usr/bin/env python3
"""
Simple HTTP Server for Static Files
Usage: python serve.py [port] [directory]
"""

import http.server
import socketserver
import os
import sys
import webbrowser
from urllib.parse import quote

# Default values
PORT = 8000
DIRECTORY = os.getcwd()  # Current working directory

# Process command line arguments
if len(sys.argv) > 1:
    try:
        PORT = int(sys.argv[1])
    except ValueError:
        print(f"Invalid port: {sys.argv[1]}")
        print("Using default port: 8000")
        PORT = 8000

if len(sys.argv) > 2:
    if os.path.isdir(sys.argv[2]):
        DIRECTORY = sys.argv[2]
    else:
        print(f"Directory not found: {sys.argv[2]}")
        print(f"Using current directory: {DIRECTORY}")

# Change to the specified directory
os.chdir(DIRECTORY)

# Create the HTTP request handler
Handler = http.server.SimpleHTTPRequestHandler

# Create the server
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    url = f"http://localhost:{PORT}"
    
    print(f"Server started at {url}")
    print(f"Serving files from: {DIRECTORY}")
    print("Press Ctrl+C to stop the server")
    
    # Try to open the browser automatically
    try:
        webbrowser.open(url)
    except:
        pass
    
    # List some useful files in the directory
    print("\nAvailable HTML files:")
    html_files = [f for f in os.listdir() if f.endswith('.html')]
    for file in html_files:
        print(f"  {url}/{quote(file)}")
    
    # Start the server
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()
        print("Server stopped.")
