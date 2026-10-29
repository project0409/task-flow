import os
from app import app, create_app
from routes.chat_sockets import socketio

if __name__ == "__main__":
    is_docker = os.environ.get("DOCKER_CONTAINER", "").lower() in ("true", "1")
    default_host = "0.0.0.0" if is_docker else "127.0.0.1"
    host = os.environ.get("FLASK_RUN_HOST", default_host)
    port = int(os.environ.get("FLASK_RUN_PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "True").lower() in ("true", "1")

    print(f"\n========================================================")
    print(f"[OK] Taskflow Pro Enterprise Server running at:")
    print(f"  --> Login Page:   http://{host}:{port}/login")
    print(f"  --> App Root:     http://{host}:{port}/")
    print(f"  --> Admin Portal: http://{host}:{port}/admin/login")
    print(f"  Demo Admin:       admin@taskflow.local  (password: Admin@123)")
    print(f"  Demo Lead:        lead_backend@taskflow.local  (password: password123)")
    print(f"========================================================\n")

    socketio.run(app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)
