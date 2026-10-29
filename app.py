import os
import uuid
from flask import Flask, render_template, session, redirect, url_for, jsonify, request
from config import Config
from models import db, bcrypt
from models.migrate import apply_migrations

# Unique runtime token generated on each server startup to ensure fresh login sessions
SERVER_STARTUP_ID = uuid.uuid4().hex

def create_app(config_class=Config):
    """Application factory for TaskFlow Pro Flask backend."""
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    bcrypt.init_app(app)

    # Register API blueprints
    from routes.auth import auth_bp
    from routes.tasks import tasks_bp
    from routes.dashboard import dashboard_bp
    from routes.admin import admin_bp
    from routes.activity import activity_bp
    from routes.teams import teams_bp
    from routes.assistant import assistant_bp
    from routes.notifications import notifications_bp
    from routes.chat_sockets import chat_bp, socketio
    from routes.attendance import attendance_bp, leaves_bp
    from routes.meetings import meetings_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(tasks_bp, url_prefix="/api/tasks")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(activity_bp, url_prefix="/api/activity")
    app.register_blueprint(teams_bp, url_prefix="/api/teams")
    app.register_blueprint(assistant_bp, url_prefix="/api/assistant")
    app.register_blueprint(notifications_bp, url_prefix="/api/notifications")
    app.register_blueprint(chat_bp, url_prefix="/api/chat")
    app.register_blueprint(attendance_bp, url_prefix="/api/attendance")
    app.register_blueprint(leaves_bp, url_prefix="/api/leaves")
    app.register_blueprint(meetings_bp, url_prefix="/api/meetings")

    # Initialize Flask-SocketIO
    socketio.init_app(app)

    # Team members alias endpoint (/api/team/members and /api/teams/members)
    @app.route("/api/team/members", methods=["GET"])
    def team_members_alias():
        from routes.teams import get_team_members
        return get_team_members()

    # Frontend Page Routes
    @app.before_request
    def enforce_fresh_login_per_startup():
        """Ensure application starts from the login page on fresh server runs."""
        if request.path.startswith("/static/"):
            return
        if not app.config.get("TESTING"):
            if session.get("server_instance") != SERVER_STARTUP_ID:
                session.clear()
                session["server_instance"] = SERVER_STARTUP_ID

    @app.route("/")
    def index():
        user_id = session.get("user_id")
        if not user_id:
            return redirect(url_for("login_page"))
        from models import User
        user = db.session.get(User, user_id)
        if not user:
            session.clear()
            return redirect(url_for("login_page"))
        return render_template("index.html")

    @app.route("/login")
    @app.route("/signup")
    def login_page():
        try:
            from models import Team
            teams = Team.query.order_by(Team.name.asc()).all()
        except Exception:
            teams = []
        return render_template("login.html", teams=teams)

    @app.route("/admin/login")
    def admin_login_page():
        return render_template("admin_login.html")

    @app.route("/dashboard")
    def dashboard():
        return redirect(url_for("index"))

    # Generic JSON and HTML error handlers
    @app.errorhandler(400)
    def bad_request(err):
        msg = getattr(err, "description", None) or "Bad request."
        return jsonify(error=msg), 400

    @app.errorhandler(403)
    def forbidden(err):
        msg = getattr(err, "description", None) or "Forbidden. Administrative privileges required."
        return jsonify(error=msg), 403

    @app.errorhandler(404)
    def not_found(err):
        msg = getattr(err, "description", None) or "Resource not found."
        if request.accept_mimetypes.accept_html and not request.path.startswith("/api/"):
            return redirect(url_for("login_page"))
        return jsonify(error=msg), 404

    @app.errorhandler(405)
    def method_not_allowed(err):
        msg = getattr(err, "description", None) or "Method not allowed."
        return jsonify(error=msg), 405

    @app.errorhandler(500)
    def internal_error(err):
        app.logger.error(f"Internal server error: {err}", exc_info=True)
        return jsonify(error="An internal server error occurred."), 500

    # Ensure tables exist and apply non-destructive SQLite column additions
    with app.app_context():
        # Ensure database directory exists if path is specified
        db_uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
        if "sqlite:///" in db_uri and not db_uri.endswith(":memory:"):
            db_file = db_uri.replace("sqlite:///", "")
            db_dir = os.path.dirname(os.path.abspath(db_file))
            if db_dir:
                os.makedirs(db_dir, exist_ok=True)

        # 1. Create base tables
        db.create_all()

        # 2. Apply SQLite migrations if connecting to a real file
        if "sqlite:///" in db_uri and not db_uri.endswith(":memory:"):
            db_file = db_uri.replace("sqlite:///", "")
            apply_migrations(os.path.abspath(db_file))

        # 3. Bootstrap: Ensure demo squads and accounts exist when not running unit tests
        if not app.config.get("TESTING"):
            try:
                from seed import ensure_seed_data
                ensure_seed_data()
            except Exception as e:
                print(f"[Warning] Demo seeding exception: {e}")

    return app

# Module-level application instance for WSGI / CLI / Direct run
app = create_app()

if __name__ == "__main__":
    from routes.chat_sockets import socketio
    is_docker = os.environ.get("DOCKER_CONTAINER", "").lower() in ("true", "1")
    default_host = "0.0.0.0" if is_docker else "127.0.0.1"
    host = os.environ.get("FLASK_RUN_HOST", default_host)
    port = int(os.environ.get("FLASK_RUN_PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "True").lower() in ("true", "1")

    print(f"\n========================================================")
    print(f"[OK] Taskflow Pro Enterprise Server running at:")
    print(f"  --> http://{host}:{port}")
    print(f"  Admin Portal: http://{host}:{port}/admin/login")
    print(f"  Demo Admin: admin@taskflow.local  (password: Admin@123)")
    print(f"  Demo Lead:  lead_backend@taskflow.local  (password: password123)")
    print(f"========================================================\n")

    socketio.run(app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)
