require('dotenv').config(); // Thêm dòng này để tải biến môi trường từ file .env
const express = require('express');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { ScanCommand, PutCommand, DeleteCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const { v4: uuid } = require('uuid');
const app = express();

app.use(express.json());  // Đọc dữ liệu JSON từ request body
app.use(express.urlencoded({ extended: true })); // Đọc dữ liệu form-urlencoded

app.use(express.static("./views"));
app.set('view engine', 'ejs');
app.set('views', './views');

// Khởi tạo DynamoDB Client với AWS SDK v3
const client = new DynamoDBClient({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Lấy từ biến môi trường
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY // Lấy từ biến môi trường
    }
});
const docClient = DynamoDBDocumentClient.from(client);

// Khởi tạo S3 Client
const s3 = new S3Client({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const tableName = 'SanPham';
const CLOUD_FRONT_URL = 'https://d1mytw3xou3lgl.cloudfront.net';

// Cấu hình multer cho upload file
const storage = multer.memoryStorage({
    destination(req, file, callback) {
        callback(null, '');
    },
});

// Kiểm tra loại file
function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (extname && mimetype) {
        return cb(null, true);
    }
    
    return cb("Error: Image Only");
}

// Cấu hình middleware upload
const upload = multer({
    storage,
    limits: { fileSize: 2000000 }, // 2MB
    fileFilter(req, file, cb) {
        checkFileType(file, cb);
    },
});

// Lấy danh sách sản phẩm từ DynamoDB
app.get('/', async (req, res) => {
    try {
        const command = new ScanCommand({ TableName: tableName });
        const data = await docClient.send(command);
        console.log("✅ Dữ liệu từ DynamoDB:", data.Items);
        
        return res.render('index', {
            sanPhams: data.Items || [],
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        console.error("❌ Lỗi lấy dữ liệu từ DynamoDB:", err);
        return res.render('index', {
            sanPhams: [],
            error: 'Failed to fetch data from DynamoDB',
            success: null
        });
    }
});

// API để thêm sản phẩm mới với hình ảnh
app.post('/', upload.single('image'), async (req, res) => {
    const { ma_sp, ten_sp, so_luong } = req.body;
    
    // Xử lý file upload
    if (req.file) {
        const image = req.file.originalname.split(".");
        
        const filetype = image[image.length -1];
        const filePath = `${uuid() + Date.now().toString()}.${filetype}`;
        const params = {
            Bucket: "uploads3bucketlab7",
            Key: filePath,
            Body: req.file.buffer
        };
        
        try {
            // Upload file lên S3
            await s3.send(new PutObjectCommand(params));
            
            // Tạo item mới trong DynamoDB
            const newItem = {
                TableName: tableName,
                Item: {
                    "ma_sp": ma_sp,
                    "ten_sp": ten_sp,
                    "so_luong": so_luong,
                    "image_url": `${CLOUD_FRONT_URL}/${filePath}`
                }
            };
            
            // Lưu vào DynamoDB
            await docClient.send(new PutCommand(newItem));
            
            return res.redirect('/');
        } catch (error) {
            console.log("error = ", error);
            return res.send("Internal Server Error");
        }
    } else {
        try {
            const command = new PutCommand({
                TableName: tableName,
                Item: {
                    "ma_sp": String(ma_sp),
                    "ten_sp": ten_sp,
                    "so_luong": parseInt(so_luong) || 0
                }
            });
            
            await docClient.send(command);
            console.log("✅ Thêm dữ liệu vào DynamoDB:", command.input.Item);
            return res.redirect('/?success=Item added');
        } catch (err) {
            console.error("❌ Lỗi thêm dữ liệu vào DynamoDB:", err);
            return res.redirect('/?error=Failed to add item');
        }
    }
});

// Xóa sản phẩm trong DynamoDB
app.post('/delete', async (req, res) => {
    console.log("req.body:", req.body);
    
    const listItems = Object.keys(req.body);
    if (listItems.length === 0) {
        return res.redirect('/?error=No items selected');
    }
    
    async function onDeleteItem(index) {
        if (index >= listItems.length) {
            return res.redirect('/?success=Items deleted');
        }
        
        try {
            const command = new DeleteCommand({
                TableName: tableName,
                Key: { "ma_sp": String(listItems[index]) }
            });
            
            await docClient.send(command);
            console.log(`✅ Xóa sản phẩm: ${listItems[index]}`);
        } catch (err) {
            console.error("❌ Lỗi xóa dữ liệu từ DynamoDB:", err);
            return res.redirect('/?error=Failed to delete items');
        }
        
        onDeleteItem(index + 1);
    }
    
    onDeleteItem(0);
});

const port = 3000;
app.listen(port, () => {
    console.log(`✅ Server is running at http://localhost:${port}`);
});