import { io, Socket } from 'socket.io-client';

const API_BASE = 'http://localhost:3000/api/v1';
const WS_URL = 'http://localhost:3000';

const studentCredentials = {
  email: 'student.test@aihn.vn',
  password: 'Student@123456',
};

async function login(): Promise<string> {
  console.log(`1. Đăng nhập học sinh (${studentCredentials.email})...`);
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(studentCredentials),
  });

  if (!res.ok) {
    throw new Error(`Đăng nhập thất bại: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as any;
  const token = json.data?.accessToken;
  console.log(`✅ Đăng nhập thành công! User ID: ${json.data?.user?.id}, Tên: ${json.data?.user?.fullname}\n`);
  return token;
}

function waitForEvent<T = any>(socket: Socket, event: string, timeoutMs = 25000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout ${timeoutMs}ms chờ sự kiện: ${event}`));
    }, timeoutMs);

    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function askQuestion(socket: Socket, sessionId: number, question: string): Promise<string> {
  console.log(`\n💬 HỌC SINH HỎI: "${question}"`);
  console.log('----------------------------------------------------');
  process.stdout.write('🤖 CỐ VẤN AI TRẢ LỜI: ');

  let fullAnswer = '';

  const answerPromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout chờ câu trả lời từ AI-service'));
    }, 60000);

    const onToken = (data: { sessionId: number; content: string; turnId: string }) => {
      if (data.sessionId === sessionId) {
        process.stdout.write(data.content);
        fullAnswer += data.content;
      }
    };

    const onEnd = (data: { sessionId: number; turnId: string; status?: string }) => {
      if (data.sessionId === sessionId) {
        clearTimeout(timeout);
        socket.off('answer_token', onToken);
        socket.off('answer_end', onEnd);
        socket.off('answer_error', onError);
        console.log('\n----------------------------------------------------');
        resolve(fullAnswer);
      }
    };

    const onError = (err: any) => {
      clearTimeout(timeout);
      socket.off('answer_token', onToken);
      socket.off('answer_end', onEnd);
      socket.off('answer_error', onError);
      reject(new Error(`Lỗi khi sinh câu trả lời: ${JSON.stringify(err)}`));
    };

    socket.on('answer_token', onToken);
    socket.on('answer_end', onEnd);
    socket.on('answer_error', onError);
  });

  socket.emit('ask', { sessionId, content: question });

  return answerPromise;
}

async function main() {
  try {
    console.log('====================================================');
    console.log('🤖 TEST TÍNH NĂNG CỐ VẤN HƯỚNG NGHIỆP AI (ADVISOR)');
    console.log('====================================================\n');

    // 1. Đăng nhập
    const token = await login();

    // 2. Kết nối WebSocket Socket.IO
    console.log('2. Kết nối tới Socket.IO Chat Gateway (ws://localhost:3000)...');
    const socket: Socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });

    const connectedData = await waitForEvent(socket, 'connected');
    console.log('✅ Đã kết nối phiên tư vấn AI thành công!');
    console.log(`   - Session ID: ${connectedData.sessionId}`);
    console.log(`   - User ID: ${connectedData.userID}`);
    console.log(`   - Lần làm bài Holland (Attempt ID): ${connectedData.attemptId}\n`);

    const sessionId = connectedData.sessionId;

    // 3. Câu hỏi 1: Liên quan trực tiếp tới kết quả test RIA (Kỹ sư 15, Nghiên cứu 13, Nghệ thuật 10)
    const q1 =
      'Chào cố vấn, với kết quả trắc nghiệm RIA (Kỹ sư 15, Nghiên cứu 13, Nghệ thuật 10) của em, em đang phân vân giữa ngành Kỹ thuật Phần mềm và Trí tuệ Nhân tạo (AI). Cố vấn phân tích giúp em ngành nào phù hợp hơn với sở thích và thế mạnh của em?';

    await askQuestion(socket, sessionId, q1);

    // Chờ 1 giây trước câu hỏi tiếp theo
    await new Promise((r) => setTimeout(r, 1000));

    // 4. Câu hỏi 2: Hỏi sâu về điểm Nghệ thuật (A) trong nhóm RIA
    const q2 =
      'Điểm nhóm A (Nghệ thuật: 10/18) của em trong mã RIA có thể giúp ích gì và phát huy trong các vị trí công việc nào của ngành Công nghệ?';

    await askQuestion(socket, sessionId, q2);

    // 5. Kiểm tra lịch sử tin nhắn đã được lưu vào Database
    console.log('\n3. Kiểm tra lưu trữ lịch sử tin nhắn trong Database...');
    const histRes = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (histRes.ok) {
      const histData = (await histRes.json()) as any;
      console.log(`✅ Đã lưu ${histData.data?.length} tin nhắn trong CSDL cho phiên #${sessionId}:`);
      for (const msg of histData.data) {
        const preview = msg.content.length > 80 ? msg.content.slice(0, 80) + '...' : msg.content;
        console.log(`   [${msg.role?.toUpperCase() || 'SYSTEM'}]: ${preview}`);
      }
    }

    socket.disconnect();

    console.log('\n====================================================');
    console.log('🎉 TEST TÍNH NĂNG CỐ VẤN AI HOÀN TẤT XUẤT SẮC!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ Lỗi kiểm thử:', error);
    process.exitCode = 1;
  }
}

main();

