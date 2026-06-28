from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
import os

app = Flask(__name__, static_folder='../frontend', static_url_path='')

app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'delta-studio-secret-key-2026')
database_url = os.environ.get('DATABASE_URL', 'sqlite:///delta_studio.db')
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'jwt-delta-studio-secret-2026')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=7)

db = SQLAlchemy(app)
jwt = JWTManager(app)
CORS(app, resources={r"/api/*": {"origins": "*"}})


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    role = db.Column(db.String(20), default='customer')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    orders = db.relationship('Order', backref='user', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'username': self.username, 'email': self.email,
            'phone': self.phone, 'role': self.role,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    price = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(100), nullable=True)
    image_url = db.Column(db.String(500), nullable=True)
    stock = db.Column(db.Integer, default=99)
    is_available = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'description': self.description,
            'price': self.price, 'category': self.category, 'image_url': self.image_url,
            'stock': self.stock, 'is_available': self.is_available,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    customer_name = db.Column(db.String(100), nullable=True)
    customer_phone = db.Column(db.String(20), nullable=True)
    customer_email = db.Column(db.String(120), nullable=True)
    total_amount = db.Column(db.Float, nullable=False, default=0)
    status = db.Column(db.String(20), default='pending')
    address = db.Column(db.Text, nullable=True)
    note = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    items = db.relationship('OrderItem', backref='order', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id, 'user_id': self.user_id,
            'customer_name': self.customer_name, 'customer_phone': self.customer_phone,
            'customer_email': self.customer_email, 'total_amount': self.total_amount,
            'status': self.status, 'address': self.address, 'note': self.note,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'items': [item.to_dict() for item in self.items]
        }


class OrderItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('order.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=True)
    product_name = db.Column(db.String(200), nullable=True)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    price = db.Column(db.Float, nullable=False)

    def to_dict(self):
        return {
            'id': self.id, 'order_id': self.order_id,
            'product_id': self.product_id, 'product_name': self.product_name,
            'quantity': self.quantity, 'price': self.price
        }


class ContactMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    subject = db.Column(db.String(200), nullable=True)
    message = db.Column(db.Text, nullable=False)
    reply = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default='unread')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'user_id': self.user_id, 'name': self.name,
            'email': self.email, 'phone': self.phone, 'subject': self.subject,
            'message': self.message, 'reply': self.reply, 'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': '用户名和密码不能为空'}), 400
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': '用户名已存在'}), 400
    user = User(username=data['username'],
                password_hash=generate_password_hash(data['password']),
                email=data.get('email', ''), phone=data.get('phone', ''),
                role='customer')
    db.session.add(user)
    db.session.commit()
    token = create_access_token(identity=str(user.id))
    return jsonify({'token': token, 'user': user.to_dict()}), 201


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': '用户名和密码不能为空'}), 400
    user = User.query.filter_by(username=data['username']).first()
    if not user or not check_password_hash(user.password_hash, data['password']):
        return jsonify({'error': '用户名或密码错误'}), 401
    token = create_access_token(identity=str(user.id))
    return jsonify({'token': token, 'user': user.to_dict()}), 200


@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_me():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    return jsonify(user.to_dict()), 200


@app.route('/api/auth/update', methods=['PUT'])
@jwt_required()
def update_profile():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    data = request.get_json()
    if data.get('email'): user.email = data['email']
    if data.get('phone'): user.phone = data['phone']
    db.session.commit()
    return jsonify(user.to_dict()), 200


@app.route('/api/products', methods=['GET'])
def get_products():
    category = request.args.get('category')
    query = Product.query
    if category:
        query = query.filter_by(category=category)
    products = query.all()
    return jsonify([p.to_dict() for p in products]), 200


@app.route('/api/products/categories', methods=['GET'])
def get_categories():
    categories = db.session.query(Product.category).distinct().all()
    result = [c[0] for c in categories if c[0]]
    return jsonify(result), 200


@app.route('/api/products/<int:product_id>', methods=['GET'])
def get_product(product_id):
    product = Product.query.get(product_id)
    if not product:
        return jsonify({'error': '商品不存在'}), 404
    return jsonify(product.to_dict()), 200


@app.route('/api/products', methods=['POST'])
@jwt_required()
def create_product():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
    data = request.get_json()
    product = Product(name=data['name'], description=data.get('description', ''),
                      price=float(data['price']), category=data.get('category', ''),
                      image_url=data.get('image_url', ''),
                      stock=int(data.get('stock', 99)),
                      is_available=data.get('is_available', True))
    db.session.add(product)
    db.session.commit()
    return jsonify(product.to_dict()), 201


@app.route('/api/products/<int:product_id>', methods=['PUT'])
@jwt_required()
def update_product(product_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
    product = Product.query.get(product_id)
    if not product:
        return jsonify({'error': '商品不存在'}), 404
    data = request.get_json()
    if 'name' in data: product.name = data['name']
    if 'description' in data: product.description = data['description']
    if 'price' in data: product.price = float(data['price'])
    if 'category' in data: product.category = data['category']
    if 'image_url' in data: product.image_url = data['image_url']
    if 'stock' in data: product.stock = int(data['stock'])
    if 'is_available' in data: product.is_available = data['is_available']
    db.session.commit()
    return jsonify(product.to_dict()), 200


@app.route('/api/products/<int:product_id>', methods=['DELETE'])
@jwt_required()
def delete_product(product_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
    product = Product.query.get(product_id)
    if not product:
        return jsonify({'error': '商品不存在'}), 404
    db.session.delete(product)
    db.session.commit()
    return jsonify({'message': '删除成功'}), 200


@app.route('/api/orders', methods=['POST'])
def create_order():
    data = request.get_json()
    if not data or not data.get('items') or len(data['items']) == 0:
        return jsonify({'error': '订单项不能为空'}), 400
    user_id = None
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        try:
            from flask_jwt_extended import decode_token
            decoded = decode_token(auth[7:])
            user_id = int(decoded['sub'])
        except:
            pass
    total = 0
    order_items = []
    for item in data['items']:
        product = Product.query.get(item['product_id'])
        if not product:
            return jsonify({'error': '商品不存在'}), 404
        price = float(item.get('price', product.price))
        qty = int(item.get('quantity', 1))
        total += price * qty
        order_items.append(OrderItem(product_id=product.id,
                          product_name=product.name, quantity=qty, price=price))
    order = Order(user_id=user_id, customer_name=data.get('customer_name', ''),
                  customer_phone=data.get('customer_phone', ''),
                  customer_email=data.get('customer_email', ''),
                  total_amount=total, status='pending',
                  address=data.get('address', ''), note=data.get('note', ''))
    order.items = order_items
    db.session.add(order)
    db.session.commit()
    return jsonify(order.to_dict()), 201


@app.route('/api/orders', methods=['GET'])
@jwt_required()
def get_orders():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if user.role == 'admin':
        status = request.args.get('status')
        query = Order.query
        if status:
            query = query.filter_by(status=status)
        orders = query.order_by(Order.created_at.desc()).all()
    else:
        orders = Order.query.filter_by(user_id=user_id).order_by(Order.created_at.desc()).all()
    return jsonify([o.to_dict() for o in orders]), 200


@app.route('/api/orders/<int:order_id>', methods=['GET'])
@jwt_required()
def get_order(order_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    order = Order.query.get(order_id)
    if not order:
        return jsonify({'error': '订单不存在'}), 404
    if order.user_id != user_id and user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
    return jsonify(order.to_dict()), 200


@app.route('/api/orders/<int:order_id>/status', methods=['PUT'])
@jwt_required()
def update_order_status(order_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
    order = Order.query.get(order_id)
    if not order:
        return jsonify({'error': '订单不存在'}), 404
    data = request.get_json()
    order.status = data.get('status', order.status)
    db.session.commit()
    return jsonify(order.to_dict()), 200


@app.route('/api/contact', methods=['POST'])
def submit_contact():
    data = request.get_json()
    if not data or not data.get('name') or not data.get('message'):
        return jsonify({'error': '姓名和消息不能为空'}), 400
    user_id = None
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        try:
            from flask_jwt_extended import decode_token
            decoded = decode_token(auth[7:])
            user_id = int(decoded['sub'])
        except:
            pass
    contact = ContactMessage(user_id=user_id, name=data['name'],
                             email=data.get('email', ''), phone=data.get('phone', ''),
                             subject=data.get('subject', ''), message=data['message'])
    db.session.add(contact)
    db.session.commit()
    return jsonify(contact.to_dict()), 201


@app.route('/api/contacts', methods=['GET'])
@jwt_required()
def get_contacts():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
    status = request.args.get('status')
    query = ContactMessage.query
    if status:
        query = query.filter_by(status=status)
    contacts = query.order_by(ContactMessage.created_at.desc()).all()
    return jsonify([c.to_dict() for c in contacts]), 200


@app.route('/api/contacts/<int:contact_id>/reply', methods=['PUT'])
@jwt_required()
def reply_contact(contact_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
    contact = ContactMessage.query.get(contact_id)
    if not contact:
        return jsonify({'error': '消息不存在'}), 404
    data = request.get_json()
    contact.reply = data.get('reply', contact.reply)
    contact.status = 'replied'
    db.session.commit()
    return jsonify(contact.to_dict()), 200


@app.route('/api/contacts/<int:contact_id>/status', methods=['PUT'])
@jwt_required()
def update_contact_status(contact_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
    contact = ContactMessage.query.get(contact_id)
    if not contact:
        return jsonify({'error': '消息不存在'}), 404
    data = request.get_json()
    contact.status = data.get('status', contact.status)
    db.session.commit()
    return jsonify(contact.to_dict()), 200


@app.route('/api/admin/stats', methods=['GET'])
@jwt_required()
def get_admin_stats():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
    total_orders = Order.query.count()
    total_products = Product.query.count()
    total_contacts = ContactMessage.query.count()
    pending_orders = Order.query.filter_by(status='pending').count()
    unread_messages = ContactMessage.query.filter_by(status='unread').count()
    total_revenue = db.session.query(db.func.sum(Order.total_amount)).filter(
        Order.status.in_(['completed', 'confirmed'])).scalar() or 0
    return jsonify({'total_orders': total_orders, 'total_products': total_products,
                    'total_contacts': total_contacts, 'pending_orders': pending_orders,
                    'unread_messages': unread_messages, 'total_revenue': total_revenue}), 200


@app.route('/')
def serve_index():
    return send_from_directory('../frontend', 'index.html')


@app.route('/admin')
def serve_admin():
    return send_from_directory('../frontend', 'admin.html')


@app.route('/<path:path>')
def serve_static(path):
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory('../frontend', path)


def init_db():
    with app.app_context():
        db.create_all()
        if not User.query.filter_by(username='admin').first():
            admin = User(username='admin', password_hash=generate_password_hash('admin123'),
                         email='admin@delta-studio.com', role='admin')
            db.session.add(admin)
            db.session.commit()
        if Product.query.count() == 0:
            samples = [
                Product(name='三角洲行动 排位上分 (青铜-白银)', description='安全稳定上分，职业玩家操刀，快速达标', price=49, category='上分服务', stock=999),
                Product(name='三角洲行动 排位上分 (黄金-钻石)', description='高段位专业上分，安全可靠保障', price=179, category='上分服务', stock=999),
                Product(name='三角洲行动 排位上分 (超级游戏)', description='顶级排名冲击，可观看带打过程', price=399, category='上分服务', stock=999),
                Product(name='三角洲行动 对局陪练 (单局)', description='硬核玩家对练，大神带你掌握战术技巧', price=20, category='陪练服务', stock=999),
                Product(name='三角洲行动 对局陪练 (十局套餐)', description='节省更多，系统学习地图理解与战术配合', price=160, category='陪练服务', stock=999),
                Product(name='三角洲行动 对局陪练 (二十局套餐)', description='经济实惠，全面提升游戏实力', price=300, category='陪练服务', stock=999),
                Product(name='三角洲行动 战令/任务代完成', description='快速完成战令任务', price=99, category='任务服务', stock=999),
                Product(name='三角洲行动 任务代完成 (月卡)', description='当月任务全包，每日离线自动完成', price=328, category='任务服务', stock=999),
                Product(name='三角洲行动 极速升级 (普通)', description='短时间快速升级，达到想要的等级', price=99, category='升级服务', stock=999),
                Product(name='三角洲行动 极速升级 (极速)', description='最短时间极速升级，享受速度与激情', price=199, category='升级服务', stock=999),
            ]
            db.session.add_all(samples)
            db.session.commit()


if __name__ != '__main__':
    init_db()

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port, threaded=True)
