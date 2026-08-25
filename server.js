
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require("cors");



const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});
app.use(
    cors({
        origin: "http://localhost:5173"
    })
);
app.use(express.json());
const PORT = process.env.PORT || 5000;
app.get("/", (req, res) => {
    res.json({
        message: "Socket.IO server is running"
    });
});

io.on('conneciton', (socket) => {
    console.log(
        `User connected: ${socket.id}`
    );
    socket.on("sendMessage", (message) => {

        console.log(
            `Message from ${socket.id}:`,
            message
        );

        const messageData = {
            userId: socket.id,
            message: message,
            timestamp: new Date()
        };

        // Send to everyone
        io.emit("receiveMessage", messageData);

    });
    socket.on("joinRoom", (roomId) => {

        socket.join(roomId);

        console.log(
            `${socket.id} joined room ${roomId}`
        );

        socket.emit("roomJoined", {
            roomId: roomId,
            message: `You joined ${roomId}`
        });

    });
    socket.on(
        "sendRoomMessage",
        ({ roomId, message }) => {

            const messageData = {
                userId: socket.id,
                roomId: roomId,
                message: message,
                timestamp: new Date()
            };

            io.to(roomId).emit(
                "receiveRoomMessage",
                messageData
            );

        }
    );
    socket.on("disconnect", () => {

        console.log(
            `User disconnected: ${socket.id}`
        );

    });


})

app.listen(PORT, () => {
    console.log(`server is running at ${PORT}`)
})