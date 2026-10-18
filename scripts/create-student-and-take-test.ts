import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Gender } from '../src/modules/users/dto/update-user.dto';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';

interface StudentInfo {
  fullname: string;
  email: string;
  password: string;
  class: number;
  yob: Date;
  gender: Gender;
  phone: string;
  address: string;
}

const defaultStudent: StudentInfo = {
  fullname: 'Nguyễn Minh Tuấn',
  email: 'student.test@aihn.vn',
  password: 'Student@123456',
  class: 12,
  yob: new Date('2008-04-15T00:00:00.000Z'),
  gender: Gender.MALE,
  phone: '0987654321',
  address: 'Hà Nội, Việt Nam',
};

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('====================================================');
    console.log('🚀 BẮT ĐẦU: TẠO USER HỌC SINH VÀ LÀM BÀI TEST HOLLAND');
    console.log('====================================================\n');

    // 1. Tạo hoặc cập nhật User học sinh
    console.log(`1. Khởi tạo tài khoản học sinh: ${defaultStudent.email}...`);
    const hashedPassword = await bcrypt.hash(defaultStudent.password, 10);

    let user = await prisma.user.findUnique({
      where: { email: defaultStudent.email },
    });

    if (user) {
      console.log(`- Tài khoản ${defaultStudent.email} đã tồn tại (ID=${user.id}). Dọn dẹp dữ liệu cũ để làm mới...`);
      // Dọn dẹp dữ liệu cũ của user này
      const attempts = await prisma.attempt.findMany({
        where: { userId: user.id },
        select: { id: true },
      });
      const attemptIds = attempts.map((a) => a.id);

      if (attemptIds.length > 0) {
        await prisma.chatMessage.deleteMany({
          where: { session: { attemptId: { in: attemptIds } } },
        });
        await prisma.chatSession.deleteMany({
          where: { attemptId: { in: attemptIds } },
        });
        await prisma.answer.deleteMany({
          where: { attemptId: { in: attemptIds } },
        });
        await prisma.result.deleteMany({
          where: { attemptId: { in: attemptIds } },
        });
        await prisma.snapShot.deleteMany({
          where: { attemptId: { in: attemptIds } },
        });
        await prisma.attempt.deleteMany({
          where: { id: { in: attemptIds } },
        });
      }
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          fullname: defaultStudent.fullname,
          password: hashedPassword,
          class: defaultStudent.class,
          yob: defaultStudent.yob,
          gender: defaultStudent.gender,
          phone: defaultStudent.phone,
          address: defaultStudent.address,
          role: 'USER',
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          fullname: defaultStudent.fullname,
          email: defaultStudent.email,
          password: hashedPassword,
          class: defaultStudent.class,
          yob: defaultStudent.yob,
          gender: defaultStudent.gender,
          phone: defaultStudent.phone,
          address: defaultStudent.address,
          role: 'USER',
        },
      });
      console.log(`- Tạo thành công tài khoản học sinh mới (ID=${user.id})`);
    }

    console.log(`   Họ tên: ${user.fullname}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Mật khẩu: ${defaultStudent.password}`);
    console.log(`   Lớp: ${user.class}`);
    console.log(`   Vai trò: ${user.role}\n`);

    // 2. Đăng nhập qua API lấy Access Token
    console.log('2. Đăng nhập qua API backend...');
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: defaultStudent.email,
        password: defaultStudent.password,
      }),
    });

    if (!loginRes.ok) {
      const errText = await loginRes.text();
      throw new Error(`Đăng nhập thất bại (${loginRes.status}): ${errText}`);
    }

    const loginData = (await loginRes.json()) as any;
    const accessToken = loginData.data?.accessToken;
    if (!accessToken) {
      throw new Error('Không nhận được accessToken từ API đăng nhập');
    }
    console.log('✅ Đăng nhập thành công! Nhận được JWT Access Token.\n');

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    };

    // 3. Khởi tạo phiên làm bài test (POST /test-session)
    console.log('3. Khởi tạo phiên kiểm tra Holland (POST /test-session)...');
    const startRes = await fetch(`${API_BASE}/test-session`, {
      method: 'POST',
      headers: authHeaders,
    });

    if (!startRes.ok) {
      const errText = await startRes.text();
      throw new Error(`Tạo test session thất bại (${startRes.status}): ${errText}`);
    }

    const startData = (await startRes.json()) as any;
    const attemptId = startData.data?.id;
    const totalQuestions = startData.data?.totalQuestions;
    console.log(`✅ Đã tạo bài test: Attempt ID = ${attemptId}, Tổng số câu hỏi = ${totalQuestions}\n`);

    // 4. Lấy toàn bộ câu hỏi (108 câu)
    console.log('4. Tải danh sách 108 câu hỏi trắc nghiệm RIASEC...');
    const questions = await prisma.question.findMany({
      orderBy: { id: 'asc' },
    });

    console.log(`- Đã tải ${questions.length} câu hỏi từ cơ sở dữ liệu.`);

    // 5. Chuẩn bị câu trả lời theo hồ sơ RIA (Kỹ sư / Công nghệ thực hành)
    // R (Realistic): 15/18 (thích máy móc, kỹ thuật, thực hành)
    // I (Investigative): 13/18 (thích tư duy logic, nghiên cứu, khoa học)
    // A (Artistic): 10/18 (thích sáng tạo, thiết kế)
    // E (Enterprising): 7/18
    // C (Conventional): 6/18
    // S (Social): 5/18
    console.log('5. Giả lập câu trả lời trắc nghiệm chuẩn RIASEC (Profile định hướng RIA)...');

    const targetCounts: Record<string, number> = {
      R: 15,
      I: 13,
      A: 10,
      E: 7,
      C: 6,
      S: 5,
    };

    const currentCounts: Record<string, number> = {
      R: 0,
      I: 0,
      A: 0,
      E: 0,
      C: 0,
      S: 0,
    };

    const answers = questions.map((q) => {
      const type = q.type;
      let check = false;
      if (currentCounts[type] < targetCounts[type]) {
        check = true;
        currentCounts[type]++;
      }
      return {
        questionId: q.id,
        check,
      };
    });

    console.log('   Số câu trả lời "Có" (check = true) theo nhóm:');
    for (const [code, count] of Object.entries(currentCounts)) {
      console.log(`   - Nhóm [${code}]: ${count}/18 câu`);
    }

    // 6. Nộp bài kiểm tra (POST /answer/submit-v2)
    console.log('\n6. Nộp bài làm trắc nghiệm qua API (POST /answer/submit-v2)...');
    const submitRes = await fetch(`${API_BASE}/answer/submit-v2`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        attemptId,
        answers,
      }),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      throw new Error(`Nộp bài thất bại (${submitRes.status}): ${errText}`);
    }

    const submitData = (await submitRes.json()) as any;
    console.log('✅ Nộp bài thành công!');
    console.log('   Kết quả trả về từ API nộp bài:', JSON.stringify(submitData.data, null, 2));

    // 7. Lấy chi tiết xếp hạng kết quả (GET /result/:attemptId)
    console.log('\n7. Truy vấn xếp hạng điểm số (GET /result/:attemptId)...');
    const resultRes = await fetch(`${API_BASE}/result/${attemptId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    const resultData = (await resultRes.json()) as any;
    console.log('   Xếp hạng điểm số:', JSON.stringify(resultData.data?.ranked, null, 2));
    console.log(`   Mã Top 3: ${resultData.data?.top_code}`);

    // 8. Lấy phân tích kết quả chuyên sâu & nghề nghiệp phù hợp (GET /result/analyze-result/:attemptId)
    console.log('\n8. Truy vấn phân tích tính cách và nghề nghiệp (GET /result/analyze-result/:attemptId)...');
    const analyzeRes = await fetch(`${API_BASE}/result/analyze-result/${attemptId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    const analyzeData = (await analyzeRes.json()) as any;
    const analyzeResult = analyzeData.data?.analyzeResult;

    console.log('\n====================================================');
    console.log('🎉 KẾT QUẢ BÀI ĐÁNH GIÁ NGHỀ NGHIỆP HOLLAND HOÀN CHỈNH');
    console.log('====================================================');
    console.log(`👤 Học sinh: ${defaultStudent.fullname} (Lớp ${defaultStudent.class})`);
    console.log(`📧 Email: ${defaultStudent.email}`);
    console.log(`🆔 Lần thi (Attempt ID): ${attemptId}`);
    console.log(`🎯 Mã Holland Top 3: ${resultData.data?.top_code}`);
    console.log('\n📊 Điểm số chi tiết 6 nhóm RIASEC:');
    if (resultData.data?.ranked) {
      for (const item of resultData.data.ranked) {
        console.log(`   - Hạng ${item.rank}: Nhóm [${item.type}] - Điểm: ${item.score}/18`);
      }
    }

    if (Array.isArray(analyzeResult)) {
      console.log('\n🌟 Phân tích đặc điểm nhóm tính cách hàng đầu:');
      for (const group of analyzeResult) {
        console.log(`\n📌 [${group.code}] ${group.title}`);
        if (group.description) console.log(`   Mô tả: ${group.description}`);
        if (group.personality) {
          console.log('   Đặc điểm tính cách:');
          const traits = Array.isArray(group.personality) ? group.personality : JSON.parse(group.personality);
          traits.forEach((t: string) => console.log(`     • ${t}`));
        }
        if (group.strengths) {
          console.log('   Thế mạnh:');
          const str = Array.isArray(group.strengths) ? group.strengths : JSON.parse(group.strengths);
          str.forEach((s: string) => console.log(`     • ${s}`));
        }
        if (group.careers) {
          console.log('   Nghề nghiệp phù hợp:');
          const car = Array.isArray(group.careers) ? group.careers : JSON.parse(group.careers);
          car.forEach((c: string) => console.log(`     👉 ${c}`));
        }
      }
    }

    // 9. Kiểm tra lịch sử làm bài (GET /test-session/history-by-user)
    console.log('\n9. Kiểm tra lịch sử làm bài (GET /test-session/history-by-user)...');
    const historyRes = await fetch(`${API_BASE}/test-session/history-by-user?limit=5`, {
      method: 'GET',
      headers: authHeaders,
    });
    const historyData = (await historyRes.json()) as any;
    console.log(`✅ Lịch sử trả về ${historyData.data?.formattedHistory?.length} lần làm bài.`);

    console.log('\n====================================================');
    console.log('✨ HOÀN THÀNH TẤT CẢ CÁC BƯỚC!');
    console.log('====================================================\n');
  } catch (error: any) {
    console.error('❌ Lỗi khi thực thi:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

