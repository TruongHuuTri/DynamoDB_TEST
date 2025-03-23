require('dotenv').config(); // Thêm dòng này để tải biến môi trường từ file .env
const express = require('express');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { ScanCommand, PutCommand, DeleteCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const multer = require('multer');

const app = express();
const uploads = multer();


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

const tableName = 'SanPham';

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

// Thêm sản phẩm mới vào DynamoDB
app.post('/', uploads.fields([]), async (req, res) => {
    const { ma_sp, ten_sp, so_luong } = req.body;

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