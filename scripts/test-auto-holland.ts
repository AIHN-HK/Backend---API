import { io, Socket } from 'socket.io-client';

const API_BASE = 'http://localhost:3000/api/v1';
const WS_URL = 'http://localhost:3000';

const studentCredentials = {
  email: 'student.test@aihn.vn',
  password: 'Student@123456',
};

async function login(): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(studentCredentials),
  });
  if (!res.ok) throw new Error(`Đăng nhập thất bại: ${res.status}`);
  const json = (await res.json()) as any;
  return json.data?.accessToken;
}

function waitForEvent<T = any>(socket: Socket, event: string, timeoutMs = 25000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout ${event}`)), timeoutMs);
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
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 60000);
    const onToken = (data: { sessionId: number; content: string }) => {
      if (data.sessionId === sessionId) {
        process.stdout.write(data.content);
        fullAnswer += data.content;
      }
    };
    const onEnd = (data: { sessionId: number }) => {
      if (data.sessionId === sessionId) {
        clearTimeout(timeout);
        socket.off('answer_token', onToken);
        socket.off('answer_end', onEnd);
        console.log('\n----------------------------------------------------');
        resolve(fullAnswer);
      }
    };
    socket.on('answer_token', onToken);
    socket.on('answer_end', onEnd);
    socket.on('answer_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    socket.emit('ask', { sessionId, content: question });
  });
}

async function run() {
  const token = await login();
  const socket: Socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });

  const connectedData = await waitForEvent(socket, 'connected');
  console.log('✅ Đã kết nối phiên tư vấn AI thành công!');
  console.log(`   - Session ID: ${connectedData.sessionId}`);
  console.log(`   - Attempt ID: ${connectedData.attemptId}`);

  // Học sinh hoàn toàn KHÔNG nhắc tới RIA hay điểm số:
  const question = 'Em vừa làm xong bài test trắc nghiệm, cố vấn xem giúp em có thế mạnh gì và phù hợp với những ngành nghề nào?';
  const answer = await askQuestion(socket, connectedData.sessionId, question);

  socket.disconnect();
}

run().catch(console.error);

