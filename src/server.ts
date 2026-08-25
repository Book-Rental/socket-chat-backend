import express, { Request, Response } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
    },
});

app.use(
    cors({
        origin: "http://localhost:5173",
    })
);

app.use(express.json());

const PORT = process.env.PORT || 5000;

// Health check
app.get("/", (req: Request, res: Response) => {
    res.json({
        message: "Socket.IO server is running",
    });
});

// Socket.IO connection
io.on("connection", (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    // Send message to everyone
    socket.on("sendMessage", (message: string) => {
        console.log(`Message from ${socket.id}:`, message);

        const messageData = {
            userId: socket.id,
            message,
            timestamp: new Date(),
        };

        io.emit("receiveMessage", messageData);
    });

    // Join room
    socket.on("joinRoom", (roomId: string) => {
        socket.join(roomId);

        console.log(`${socket.id} joined room ${roomId}`);

        socket.emit("roomJoined", {
            roomId,
            message: `You joined ${roomId}`,
        });
    });

    // Send message to a room
    socket.on(
        "sendRoomMessage",
        ({
            roomId,
            message,
        }: {
            roomId: string;
            message: string;
        }) => {
            const messageData = {
                userId: socket.id,
                roomId,
                message,
                timestamp: new Date(),
            };

            io.to(roomId).emit("receiveRoomMessage", messageData);
        }
    );

    // Disconnect
    socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});