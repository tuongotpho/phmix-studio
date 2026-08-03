/**
 * Kiểm thử firestore.rules trên Firestore Emulator.
 *
 * Đặt tên .spec.ts (không phải .test.ts) để `npm test` bỏ qua — bộ này cần emulator
 * đang chạy. Chạy bằng: npm run test:rules
 *
 * Yêu cầu: máy phải có Java (emulator Firestore là một file jar).
 */
import { before, after, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore
} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');

const [emulatorHost, emulatorPort] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

let testEnv: RulesTestEnvironment;

/** uid-A: người dùng thường, đã có hồ sơ. */
const alice = (): Firestore =>
  testEnv.authenticatedContext('uid-A', { email: 'alice@example.com' }).firestore() as unknown as Firestore;
/** uid-B: người dùng thường khác, sở hữu vài câu hỏi. */
const bob = (): Firestore =>
  testEnv.authenticatedContext('uid-B', { email: 'bob@example.com' }).firestore() as unknown as Firestore;
/** uid-C: vừa đăng nhập lần đầu, CHƯA có hồ sơ — dùng cho các phép create. */
const carol = (): Firestore =>
  testEnv.authenticatedContext('uid-C', { email: 'carol@example.com' }).firestore() as unknown as Firestore;
/** Quản trị viên thật: có custom claim admin do Admin SDK cấp. */
const superAdmin = (): Firestore =>
  testEnv.authenticatedContext('uid-Z', { email: 'boss@example.com', admin: true }).firestore() as unknown as Firestore;
const guest = (): Firestore =>
  testEnv.unauthenticatedContext().firestore() as unknown as Firestore;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-phmix',
    firestore: { rules: RULES, host: emulatorHost, port: Number(emulatorPort) }
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'users/uid-A'), { email: 'alice@example.com', status: 'pending' });
    await setDoc(doc(db, 'users/uid-B'), { email: 'bob@example.com', status: 'pro' });
    await setDoc(doc(db, 'questions/q-public-B'), { ownerId: 'uid-B', isPublic: true, questionText: 'cong dong' });
    await setDoc(doc(db, 'questions/q-private-B'), { ownerId: 'uid-B', isPublic: false, questionText: 'rieng tu' });
    await setDoc(doc(db, 'questions/q-own-A'), { ownerId: 'uid-A', isPublic: false, questionText: 'cua A' });
  });
});

describe('users — chặn tự nâng quyền', () => {
  it('KHÔNG cho tự tạo hồ sơ với status admin', async () => {
    // Đây là lỗ hổng gốc: client là bên ghi document, và backend getUserRole()
    // đọc đúng field status này để cấp quyền.
    await assertFails(
      setDoc(doc(carol(), 'users/uid-C'), { email: 'carol@example.com', status: 'admin' })
    );
  });

  it('KHÔNG cho tự tạo hồ sơ với status pro', async () => {
    await assertFails(
      setDoc(doc(carol(), 'users/uid-C'), { email: 'carol@example.com', status: 'pro' })
    );
  });

  it('CHO tạo hồ sơ pending với email khớp token', async () => {
    await assertSucceeds(
      setDoc(doc(carol(), 'users/uid-C'), { email: 'carol@example.com', status: 'pending', displayName: 'Carol' })
    );
  });

  it('KHÔNG cho tạo hồ sơ với email khác token', async () => {
    // Backend từng đối chiếu email trong document với ADMIN_EMAIL — đây là đường
    // leo thang thứ hai, độc lập với field status.
    await assertFails(
      setDoc(doc(carol(), 'users/uid-C'), { email: 'admin@phmix.com', status: 'pending' })
    );
  });

  it('KHÔNG cho tạo hồ sơ kèm expireAt hoặc role tự đặt', async () => {
    await assertFails(
      setDoc(doc(carol(), 'users/uid-C'), { email: 'carol@example.com', status: 'pending', expireAt: '2099-01-01' })
    );
    await assertFails(
      setDoc(doc(carol(), 'users/uid-C'), { email: 'carol@example.com', status: 'pending', role: 'admin' })
    );
  });

  it('KHÔNG cho tạo hồ sơ trên uid của người khác', async () => {
    await assertFails(
      setDoc(doc(carol(), 'users/uid-B'), { email: 'carol@example.com', status: 'pending' })
    );
  });
});

describe('users — sửa và đọc hồ sơ', () => {
  it('CHO sửa trường vô hại của chính mình', async () => {
    await assertSucceeds(updateDoc(doc(alice(), 'users/uid-A'), { displayName: 'Alice mới' }));
  });

  it('KHÔNG cho tự đổi status, expireAt hay email', async () => {
    await assertFails(updateDoc(doc(alice(), 'users/uid-A'), { status: 'pro' }));
    await assertFails(updateDoc(doc(alice(), 'users/uid-A'), { expireAt: '2099-01-01' }));
    await assertFails(updateDoc(doc(alice(), 'users/uid-A'), { email: 'admin@phmix.com' }));
  });

  it('CHO đọc hồ sơ của mình, KHÔNG cho đọc hồ sơ người khác', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/uid-A')));
    await assertFails(getDoc(doc(alice(), 'users/uid-B')));
  });

  it('KHÔNG cho người dùng thường liệt kê toàn bộ users', async () => {
    // Đúng như thiết kế: trang Quản trị đọc qua GET /api/admin/users (Admin SDK).
    await assertFails(getDocs(collection(alice(), 'users')));
  });

  it('CHO quản trị viên có custom claim liệt kê và xoá', async () => {
    await assertSucceeds(getDocs(collection(superAdmin(), 'users')));
    await assertSucceeds(deleteDoc(doc(superAdmin(), 'users/uid-B')));
  });

  it('KHÔNG cho người dùng thường tự xoá hồ sơ', async () => {
    await assertFails(deleteDoc(doc(alice(), 'users/uid-A')));
  });
});

describe('questions — quyền sở hữu', () => {
  it('CHO tạo câu hỏi với ownerId là chính mình', async () => {
    await assertSucceeds(
      setDoc(doc(alice(), 'questions/q-new'), { ownerId: 'uid-A', isPublic: false, questionText: 'moi' })
    );
  });

  it('KHÔNG cho tạo câu hỏi mang ownerId của người khác', async () => {
    await assertFails(
      setDoc(doc(alice(), 'questions/q-gia-mao'), { ownerId: 'uid-B', isPublic: true, questionText: 'gia mao' })
    );
  });

  it('KHÔNG cho tạo câu hỏi không có ownerId', async () => {
    await assertFails(
      setDoc(doc(alice(), 'questions/q-vo-chu'), { isPublic: true, questionText: 'vo chu' })
    );
  });

  it('CHO đọc câu hỏi của mình và câu hỏi công khai của người khác', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'questions/q-own-A')));
    await assertSucceeds(getDoc(doc(alice(), 'questions/q-public-B')));
  });

  it('KHÔNG cho đọc câu hỏi riêng tư của người khác', async () => {
    await assertFails(getDoc(doc(alice(), 'questions/q-private-B')));
  });

  it('truy vấn kho cộng đồng (isPublic == true) chạy được', async () => {
    await assertSucceeds(getDocs(query(collection(alice(), 'questions'), where('isPublic', '==', true))));
  });

  it('truy vấn kho cá nhân (ownerId == mình) chạy được', async () => {
    await assertSucceeds(getDocs(query(collection(alice(), 'questions'), where('ownerId', '==', 'uid-A'))));
  });

  it('KHÔNG cho sửa hay xoá câu hỏi của người khác', async () => {
    await assertFails(updateDoc(doc(alice(), 'questions/q-public-B'), { questionText: 'bi sua' }));
    await assertFails(deleteDoc(doc(alice(), 'questions/q-public-B')));
  });

  it('CHO chủ sở hữu bật chia sẻ và xoá câu hỏi của mình', async () => {
    await assertSucceeds(updateDoc(doc(alice(), 'questions/q-own-A'), { isPublic: true }));
    await assertSucceeds(deleteDoc(doc(alice(), 'questions/q-own-A')));
  });

  it('KHÔNG cho đổi chủ sở hữu khi sửa', async () => {
    await assertFails(updateDoc(doc(alice(), 'questions/q-own-A'), { ownerId: 'uid-B' }));
  });

  it('bob vẫn toàn quyền trên câu hỏi của bob', async () => {
    await assertSucceeds(updateDoc(doc(bob(), 'questions/q-private-B'), { questionText: 'bob sua' }));
  });
});

describe('khách chưa đăng nhập', () => {
  it('KHÔNG cho ghi bất cứ thứ gì', async () => {
    await assertFails(setDoc(doc(guest(), 'users/uid-X'), { email: 'x@example.com', status: 'pending' }));
    await assertFails(setDoc(doc(guest(), 'questions/q-x'), { ownerId: 'uid-X' }));
  });

  it('KHÔNG cho đọc hồ sơ người dùng', async () => {
    await assertFails(getDoc(doc(guest(), 'users/uid-A')));
  });

  it('ĐỌC ĐƯỢC câu hỏi công khai — hành vi kế thừa, cần xác nhận', async () => {
    // Rule đọc là: chủ sở hữu HOẶC isPublic == true HOẶC super admin.
    // Nhánh isPublic không đòi hỏi đăng nhập, nên khách vãng lai đọc được câu hỏi
    // đã bật chia sẻ. Bản rules cũ cũng vậy — test này ghi nhận hiện trạng chứ
    // không khẳng định đó là điều mong muốn.
    await assertSucceeds(getDoc(doc(guest(), 'questions/q-public-B')));
  });
});
