// ========================================
// VĂN CÁC - SCRIPT.JS
// KẾT NỐI SUPABASE
// ========================================

const SUPABASE_URL = "https://miuobwgtlbqfpskrxijp.supabase.co";
const SUPABASE_KEY = "sb_publishable_pmTYVrwakgubKxzTJ03M8A_ZU19tEkT";

let db = null;
let currentUser = null;
let allBooks = [];
let currentBook = null;
let currentChapterIndex = 0;
let currentFavorites = [];
let currentHistory = [];

const DEFAULT_AVATAR = "https://placehold.co/120x120?text=Avatar";
const DEFAULT_COVER = "https://placehold.co/200x280?text=Van+Cas";

// ========================================
// 1. KHỞI TẠO SUPABASE
// ========================================

function loadSupabaseLibrary() {
    return new Promise((resolve, reject) => {
        if (window.supabase) {
            resolve();
            return;
        }

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

        script.onload = resolve;
        script.onerror = () => reject(
            new Error("Không tải được thư viện Supabase!")
        );

        document.head.appendChild(script);
    });
}

async function initializeSupabase() {
    await loadSupabaseLibrary();

    db = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );

    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (data.session) {
        await loadCurrentUser();
    }

    await loadBooks();

    if (currentUser) {
        await loadFavorites();
        await loadHistory();
    }
}

// ========================================
// 2. HÀM HỖ TRỢ
// ========================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d");
}

function getCurrentAccount() {
    return currentUser;
}

function getBooks() {
    return allBooks;
}

function isAdminAccount(user) {
    return !!user && user.role === "admin";
}

function canEditBook(book) {
    if (!currentUser || !book) return false;

    return isAdminAccount(currentUser) ||
        String(book.authorId) === String(currentUser.id);
}

function canDeleteBook(book) {
    return canEditBook(book);
}

function showError(error, fallback = "Đã xảy ra lỗi!") {
    console.error(error);

    alert(error?.message || fallback);
}

function readImage(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve("");
            return;
        }

        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(
            new Error("Không thể đọc ảnh!")
        );

        reader.readAsDataURL(file);
    });
}

// ========================================
// 3. TÀI KHOẢN HIỆN TẠI
// ========================================

async function loadCurrentUser() {
    const { data, error } = await db.auth.getUser();

    if (error || !data.user) {
        currentUser = null;
        return;
    }

    const authUser = data.user;

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("id, username, avatar_url, role")
        .eq("id", authUser.id)
        .maybeSingle();

    if (profileError) throw profileError;

    currentUser = {
        id: authUser.id,
        email: authUser.email,
        username: profile?.username ||
            authUser.user_metadata?.username ||
            "Người dùng",
        avatar: profile?.avatar_url || "",
        role: profile?.role || "user"
    };
}

// ========================================
// 4. ĐĂNG KÝ
// ========================================

async function registerAccount() {
    const username = document.getElementById("username")?.value.trim();
    const email = document.getElementById("email")?.value.trim();
    const password = document.getElementById("password")?.value;
    const confirmPassword =
        document.getElementById("confirm-password")?.value;

    const message = document.getElementById("register-message");

    if (!username || !email || !password || !confirmPassword) {
        message.textContent = "Vui lòng nhập đầy đủ thông tin!";
        return;
    }

    if (username.length < 3) {
        message.textContent = "Tên người dùng phải có ít nhất 3 ký tự!";
        return;
    }

    if (password.length < 6) {
        message.textContent = "Mật khẩu phải có ít nhất 6 ký tự!";
        return;
    }

    if (password !== confirmPassword) {
        message.textContent = "Mật khẩu nhập lại không khớp!";
        return;
    }

    try {
        message.textContent = "Đang tạo tài khoản...";

        const { data: existing, error: checkError } = await db
            .from("profiles")
            .select("id")
            .ilike("username", username)
            .limit(1);

        if (checkError) throw checkError;

        if (existing && existing.length > 0) {
            message.textContent = "Tên người dùng đã được sử dụng!";
            return;
        }

        const { data, error } = await db.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username: username
                }
            }
        });

        if (error) throw error;

        if (!data.session) {
            message.textContent =
                "Đăng ký thành công! Hãy kiểm tra email để xác nhận tài khoản trước khi đăng nhập.";
            return;
        }

        await loadCurrentUser();

        message.textContent = "Đăng ký thành công!";

        setTimeout(() => {
            window.location.href = "index.html";
        }, 1000);

    } catch (error) {
        message.textContent =
            error.message || "Không thể đăng ký tài khoản!";
    }
}

// ========================================
// 5. ĐĂNG NHẬP
// ========================================

async function loginAccount() {
    const email = document.getElementById("login-email")?.value.trim();
    const password = document.getElementById("login-password")?.value;
    const message = document.getElementById("login-message");

    if (!email || !password) {
        message.textContent = "Vui lòng nhập email và mật khẩu!";
        return;
    }

    try {
        message.textContent = "Đang đăng nhập...";

        const { error } = await db.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        await loadCurrentUser();
        await loadFavorites();
        await loadHistory();

        alert("Đăng nhập thành công!");

        window.location.href = "index.html";

    } catch (error) {
        message.textContent =
            error.message || "Email hoặc mật khẩu không đúng!";
    }
}

// ========================================
// 6. ĐĂNG XUẤT
// ========================================

async function logoutAccount() {
    const { error } = await db.auth.signOut();

    if (error) {
        showError(error);
        return;
    }

    currentUser = null;
    currentFavorites = [];
    currentHistory = [];

    alert("Bạn đã đăng xuất!");

    window.location.href = "index.html";
}

// ========================================
// 7. HIỂN THỊ TÀI KHOẢN
// ========================================

function displayAccount() {
    const area = document.getElementById("account-area");

    if (!area) return;

    if (currentUser) {
        area.innerHTML = `
            <a href="tai-khoan.html">
                👤 ${escapeHTML(currentUser.username)}
            </a>
        `;
    } else {
        area.innerHTML = `
            <a href="dang-nhap.html">Đăng nhập</a>
            <a href="dang-ky.html">Đăng ký</a>
        `;
    }
}

// ========================================
// 8. TẢI DANH SÁCH TRUYỆN
// ========================================

async function loadBooks() {
    const { data, error } = await db
        .from("books")
        .select(`
            *,
            profiles:author_id (
                username
            ),
            chapters (
                id,
                chapter_number,
                sub_number,
                title,
                content
            )
        `)
        .order("created_at", { ascending: false });

    if (error) throw error;

    allBooks = (data || []).map(book => ({
        id: book.id,
        title: book.title,
        author: book.profiles?.username || "Tác giả ẩn danh",
        authorId: book.author_id,
        genre: book.genre,
        description: book.description || "",
        status: book.status || "",
        cover: book.cover_url || "",
        chapters: (book.chapters || [])
            .sort((a, b) => a.chapter_number - b.chapter_number)
            .map(chapter => ({
                id: chapter.id,
                number: chapter.chapter_number,
                subNumber: chapter.sub_number || "",
                title: chapter.title,
                content: chapter.content
            }))
    }));

    displayBooks();
}

// ========================================
// 9. TẢI ẢNH LÊN SUPABASE
// ========================================

async function uploadImage(file, bucket) {
    if (!file) return "";

    if (!file.type.startsWith("image/")) {
        throw new Error("Tệp được chọn không phải hình ảnh!");
    }

    if (file.size > 5 * 1024 * 1024) {
        throw new Error("Ảnh không được lớn hơn 5 MB!");
    }

    const extension = file.name.split(".").pop();
    const fileName =
        `${currentUser.id}/${crypto.randomUUID()}.${extension}`;

    const { error } = await db.storage
        .from(bucket)
        .upload(fileName, file, {
            upsert: false
        });

    if (error) throw error;

    const { data } = db.storage
        .from(bucket)
        .getPublicUrl(fileName);

    return data.publicUrl;
}

// ========================================
// 10. ĐĂNG TRUYỆN
// ========================================

async function publishBook() {
    if (!currentUser) {
        alert("Bạn cần đăng nhập trước!");
        window.location.href = "dang-nhap.html";
        return;
    }

    const title = document.getElementById("title").value.trim();
    const genre = document.getElementById("genre").value.trim();
    const description =
        document.getElementById("description").value.trim();
    const status = document.getElementById("status").value;
    const chapterTitle =
        document.getElementById("chapter-title").value.trim();
    const content = document.getElementById("content").value.trim();
    const coverFile = document.getElementById("cover").files[0];

    if (!title || !genre || !chapterTitle || !content) {
        alert("Vui lòng nhập đầy đủ thông tin!");
        return;
    }

    try {
        let coverUrl = "";

        if (coverFile) {
            coverUrl = await uploadImage(coverFile, "book-covers");
        }

        const { data: book, error: bookError } = await db
            .from("books")
            .insert({
                author_id: currentUser.id,
                title,
                genre,
                description,
                status,
                cover_url: coverUrl
            })
            .select()
            .single();

        if (bookError) throw bookError;

        const { error: chapterError } = await db
            .from("chapters")
            .insert({
                book_id: book.id,
                chapter_number: 1,
                sub_number: "",
                title: chapterTitle,
                content
            });

        if (chapterError) {
            await db.from("books").delete().eq("id", book.id);
            throw chapterError;
        }

        alert("Đăng tác phẩm thành công!");

        window.location.href = "index.html";

    } catch (error) {
        showError(error, "Không thể đăng tác phẩm!");
    }
}

// ========================================
// 11. HIỂN THỊ TRUYỆN
// ========================================

function displayBooks(list = null) {
    const container = document.getElementById("book-list");

    if (!container) return;

    const books = list === null ? allBooks : list;

    if (!books.length) {
        container.innerHTML =
            "<p>Chưa có tác phẩm nào phù hợp.</p>";
        return;
    }

    container.innerHTML = books.map(book => {
        const favorite = currentFavorites.some(
            id => String(id) === String(book.id)
        );

        return `
            <div class="book-card">

                <img
                    src="${escapeHTML(book.cover || DEFAULT_COVER)}"
                    alt="Ảnh bìa"
                >

                <h3>${escapeHTML(book.title)}</h3>

                <p>Tác giả: ${escapeHTML(book.author)}</p>
                <p>Thể loại: ${escapeHTML(book.genre)}</p>
                <p>${escapeHTML(book.description)}</p>
                <p>Trạng thái: ${escapeHTML(book.status)}</p>
                <p>Số chương: ${book.chapters.length}</p>

                <a href="doc-truyen.html?id=${encodeURIComponent(book.id)}">
                    <button>ĐỌC TRUYỆN</button>
                </a>

                ${currentUser ? `
                    <button onclick="toggleFavorite('${book.id}')">
                        ${favorite ? "⭐ Bỏ yêu thích" : "☆ Yêu thích"}
                    </button>
                ` : ""}

                ${canDeleteBook(book) ? `
                    <button onclick="deleteBook('${book.id}')">
                        XÓA TRUYỆN
                    </button>
                ` : ""}

            </div>
        `;
    }).join("");
}

// ========================================
// 12. TÌM KIẾM VÀ LỌC
// ========================================

function filterBooks(genre) {
    if (genre === "all") {
        displayBooks();
        return;
    }

    displayBooks(allBooks.filter(book => book.genre === genre));
}

function searchBooks() {
    const input = document.getElementById("search-book");

    if (!input) return;

    const keyword = normalizeText(input.value.trim());

    if (!keyword) {
        displayBooks();
        return;
    }

    const results = allBooks.filter(book =>
        normalizeText(book.title).includes(keyword) ||
        normalizeText(book.author).includes(keyword)
    );

    displayBooks(results);
}

// ========================================
// 13. XÓA TRUYỆN
// ========================================

async function deleteBook(id) {
    const book = allBooks.find(
        item => String(item.id) === String(id)
    );

    if (!book) {
        alert("Không tìm thấy truyện!");
        return;
    }

    if (!canDeleteBook(book)) {
        alert("Bạn không có quyền xóa truyện này!");
        return;
    }

    if (!confirm("Bạn có chắc chắn muốn xóa truyện này?")) {
        return;
    }

    const { error } = await db
        .from("books")
        .delete()
        .eq("id", id);

    if (error) {
        showError(error);
        return;
    }

    await loadBooks();

    alert("Đã xóa truyện!");
}

// ========================================
// 14. YÊU THÍCH
// ========================================

async function loadFavorites() {
    if (!currentUser) return;

    const { data, error } = await db
        .from("favorites")
        .select("book_id")
        .eq("user_id", currentUser.id);

    if (error) throw error;

    currentFavorites = (data || []).map(item => item.book_id);
}

function getFavorites() {
    return currentFavorites;
}

async function toggleFavorite(bookId) {
    if (!currentUser) {
        alert("Bạn cần đăng nhập!");
        return;
    }

    const exists = currentFavorites.some(
        id => String(id) === String(bookId)
    );

    if (exists) {
        const { error } = await db
            .from("favorites")
            .delete()
            .eq("user_id", currentUser.id)
            .eq("book_id", bookId);

        if (error) {
            showError(error);
            return;
        }
    } else {
        const { error } = await db
            .from("favorites")
            .insert({
                user_id: currentUser.id,
                book_id: bookId
            });

        if (error) {
            showError(error);
            return;
        }
    }

    await loadFavorites();
    displayBooks();

    if (document.getElementById("account-content")) {
        const tab = window.currentAccountTab || "favorites";

        if (tab === "favorites") {
            await showAccountTab("favorites");
        }
    }
}

// ========================================
// 15. LỊCH SỬ ĐỌC
// ========================================

async function loadHistory() {
    if (!currentUser) return;

    const { data, error } = await db
        .from("reading_history")
        .select("book_id, chapter_id, last_read_at")
        .eq("user_id", currentUser.id)
        .order("last_read_at", { ascending: false });

    if (error) throw error;

    currentHistory = data || [];
}

async function saveHistory(bookId, chapterId) {
    if (!currentUser || !chapterId) return;

    const { error } = await db
        .from("reading_history")
        .upsert({
            user_id: currentUser.id,
            book_id: bookId,
            chapter_id: chapterId,
            last_read_at: new Date().toISOString()
        }, {
            onConflict: "user_id,book_id"
        });

    if (error) {
        console.error("Không lưu được lịch sử:", error);
        return;
    }

    await loadHistory();
}

function getHistory() {
    return currentHistory;
}

// ========================================
// 16. ĐỌC TRUYỆN
// ========================================

async function openBook() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (!id) return;

    currentBook = allBooks.find(
        book => String(book.id) === String(id)
    );

    if (!currentBook) {
        alert("Không tìm thấy truyện!");
        return;
    }

    currentChapterIndex = 0;

    displayChapter();
}

function displayChapter() {
    if (!currentBook) return;

    const chapter = currentBook.chapters[currentChapterIndex];

    if (!chapter) return;

    const title = document.getElementById("book-title");
    const author = document.getElementById("book-author");
    const chapterTitle = document.getElementById("chapter-title");

    const content =
        document.getElementById("chapter-content") ||
        document.getElementById("content");

    const number = document.getElementById("chapter-number");

    if (title) title.textContent = currentBook.title;
    if (author) author.textContent = currentBook.author;
    if (chapterTitle) chapterTitle.textContent = chapter.title;
    if (content) content.textContent = chapter.content;

    if (number) {
        number.textContent =
            `Chương ${currentChapterIndex + 1}`;
    }

    saveHistory(currentBook.id, chapter.id);
}

function nextChapter() {
    if (!currentBook) return;

    if (currentChapterIndex < currentBook.chapters.length - 1) {
        currentChapterIndex++;
        displayChapter();
    } else {
        alert("Đây là chương cuối cùng!");
    }
}

function previousChapter() {
    if (!currentBook) return;

    if (currentChapterIndex > 0) {
        currentChapterIndex--;
        displayChapter();
    } else {
        alert("Đây là chương đầu tiên!");
    }
}

async function deleteCurrentChapter() {
    if (!currentBook || !canEditBook(currentBook)) {
        alert("Bạn không có quyền xóa chương!");
        return;
    }

    if (currentBook.chapters.length <= 1) {
        alert("Tác phẩm phải có ít nhất một chương!");
        return;
    }

    if (!confirm("Bạn có chắc chắn muốn xóa chương này?")) return;

    const chapter = currentBook.chapters[currentChapterIndex];

    const { error } = await db
        .from("chapters")
        .delete()
        .eq("id", chapter.id);

    if (error) {
        showError(error);
        return;
    }

    await loadBooks();

    currentBook = allBooks.find(
        book => String(book.id) === String(currentBook.id)
    );

    if (currentChapterIndex >= currentBook.chapters.length) {
        currentChapterIndex--;
    }

    displayChapter();

    alert("Đã xóa chương!");
}

// ========================================
// 17. TRANG CÁ NHÂN
// ========================================

async function loadAccountPage() {
    if (!currentUser) {
        alert("Bạn cần đăng nhập!");
        window.location.href = "dang-nhap.html";
        return;
    }

    const name = document.getElementById("account-name");
    const avatar = document.getElementById("account-avatar");

    if (name) name.textContent = currentUser.username;

    if (avatar) {
        avatar.src = currentUser.avatar || DEFAULT_AVATAR;
    }

    renderAccountSwitcher();
}

function renderAccountSwitcher() {
    const select = document.getElementById("switch-account-select");

    if (!select) return;

    select.innerHTML = `
        <option value="">Đăng nhập tài khoản khác</option>
        <option value="__add_account__">+ Đăng nhập tài khoản khác</option>
    `;
}

function switchAccount() {
    window.location.href = "dang-nhap.html";
}

// ========================================
// 18. CÁC MỤC TRANG CÁ NHÂN
// ========================================

window.currentAccountTab = "history";

async function showAccountTab(tab) {
    const content = document.getElementById("account-content");
    const settings = document.getElementById("account-settings");

    if (!content || !settings || !currentUser) return;

    window.currentAccountTab = tab;
    settings.style.display = "none";

    if (tab === "settings") {
        settings.style.display = "block";

        content.innerHTML = `
            <h2>⚙️ CÀI ĐẶT TÀI KHOẢN</h2>
            <p>Quản lý thông tin cá nhân của bạn.</p>
        `;

        return;
    }

    if (tab === "stories") {
        const myBooks = isAdminAccount(currentUser)
            ? allBooks
            : allBooks.filter(book =>
                String(book.authorId) === String(currentUser.id)
            );

        content.innerHTML = `
            <h2>✍️ ${isAdminAccount(currentUser)
                ? "QUẢN LÝ TẤT CẢ TÁC PHẨM"
                : "TRUYỆN SÁNG TÁC"}</h2>

            ${myBooks.length === 0
                ? "<p>Bạn chưa đăng truyện nào.</p>"
                : myBooks.map(book => `
                    <div class="book-card">
                        <img
                            src="${escapeHTML(book.cover || DEFAULT_COVER)}"
                            alt="Ảnh bìa"
                        >

                        <h3>${escapeHTML(book.title)}</h3>
                        <p>Thể loại: ${escapeHTML(book.genre)}</p>
                        <p>Số chương: ${book.chapters.length}</p>

                        <a href="doc-truyen.html?id=${encodeURIComponent(book.id)}">
                            <button>ĐỌC TRUYỆN</button>
                        </a>

                        <button onclick="openBookEditor('${book.id}')">
                            ✏️ CHỈNH SỬA
                        </button>
                    </div>
                `).join("")
            }
        `;

        return;
    }

    if (tab === "favorites") {
        await loadFavorites();

        const favoriteBooks = allBooks.filter(book =>
            currentFavorites.some(
                id => String(id) === String(book.id)
            )
        );

        content.innerHTML = `
            <h2>⭐ TRUYỆN YÊU THÍCH</h2>

            ${favoriteBooks.length === 0
                ? "<p>Bạn chưa có truyện yêu thích.</p>"
                : favoriteBooks.map(book => `
                    <div class="book-card">
                        <h3>${escapeHTML(book.title)}</h3>
                        <p>Tác giả: ${escapeHTML(book.author)}</p>

                        <a href="doc-truyen.html?id=${encodeURIComponent(book.id)}">
                            <button>ĐỌC TRUYỆN</button>
                        </a>

                        <button onclick="toggleFavorite('${book.id}')">
                            BỎ YÊU THÍCH
                        </button>
                    </div>
                `).join("")
            }
        `;

        return;
    }

    if (tab === "history") {
        await loadHistory();

        content.innerHTML = `
            <h2>📖 LỊCH SỬ ĐỌC TRUYỆN</h2>

            ${currentHistory.length === 0
                ? "<p>Bạn chưa đọc truyện nào.</p>"
                : currentHistory.map(item => {
                    const book = allBooks.find(
                        b => String(b.id) === String(item.book_id)
                    );

                    if (!book) return "";

                    const chapterIndex = book.chapters.findIndex(
                        c => String(c.id) === String(item.chapter_id)
                    );

                    return `
                        <div class="book-card">
                            <h3>${escapeHTML(book.title)}</h3>
                            <p>Chương ${chapterIndex >= 0
                                ? chapterIndex + 1
                                : "đã đọc"}</p>

                            <a href="doc-truyen.html?id=${encodeURIComponent(book.id)}">
                                <button>ĐỌC TIẾP</button>
                            </a>
                        </div>
                    `;
                }).join("")
            }
        `;
    }
}

// ========================================
// 19. CHỈNH SỬA TÁC PHẨM
// ========================================

function openBookEditor(bookId) {
    const book = allBooks.find(
        item => String(item.id) === String(bookId)
    );

    if (!book) {
        alert("Không tìm thấy tác phẩm!");
        return;
    }

    if (!canEditBook(book)) {
        alert("Bạn không có quyền chỉnh sửa tác phẩm này!");
        return;
    }

    renderBookEditor(book);
}

function renderBookEditor(book) {
    const content = document.getElementById("account-content");

    if (!content) return;

    const genres = [
        "truyện ngắn",
        "chiến tranh",
        "Huyền huyễn",
        "Đô thị",
        "Khoa huyễn",
        "Trọng sinh",
        "Xuyên không",
        "Lịch sử",
        "Quân sự",
        "Kinh dị",
        "Trinh thám",
        "Nghị luận văn học",
        "Nghị luận xã hội, tiểu luận",
        "Đồng nhân",
        "Khác"
    ];

    content.innerHTML = `
        <h2>✏️ CHỈNH SỬA TÁC PHẨM</h2>

        <label>Tên tác phẩm:</label>
        <input
            type="text"
            id="edit-book-title"
            value="${escapeHTML(book.title)}"
        >

        <label>Thể loại:</label>
        <select id="edit-book-genre">
            ${genres.map(genre => `
                <option
                    value="${escapeHTML(genre)}"
                    ${book.genre === genre ? "selected" : ""}
                >
                    ${escapeHTML(genre)}
                </option>
            `).join("")}
        </select>

        <label>Giới thiệu tác phẩm:</label>
        <textarea id="edit-book-description" rows="5">${escapeHTML(book.description)}</textarea>

        <label>Tiến trình tác phẩm:</label>
        <select id="edit-book-status">
            <option value="Đang tiến hành"
                ${book.status === "Đang tiến hành" ? "selected" : ""}>
                Đang tiến hành
            </option>

            <option value="Đã hoàn thành"
                ${book.status === "Đã hoàn thành" ? "selected" : ""}>
                Đã hoàn thành
            </option>

            <option value="Tạm ngưng"
                ${book.status === "Tạm ngưng" ? "selected" : ""}>
                Tạm ngưng
            </option>
        </select>

        <label>Thay ảnh bìa:</label>
        <input type="file" id="edit-book-cover" accept="image/*">

        <hr>

        <h3>📚 QUẢN LÝ CHƯƠNG</h3>

        <div id="edit-chapter-list">
            ${book.chapters.map((chapter, index) => `
                <div class="book-card">
                    <h3>Chương ${index + 1}</h3>

                    <label>Tên chương:</label>
                    <input
                        type="text"
                        id="edit-chapter-title-${index}"
                        value="${escapeHTML(chapter.title)}"
                    >

                    <label>Nội dung chương:</label>
                    <textarea
                        id="edit-chapter-content-${index}"
                        rows="10"
                    >${escapeHTML(chapter.content)}</textarea>

                    <button onclick="removeChapterFromEditor('${book.id}', ${index})">
                        🗑️ XÓA CHƯƠNG
                    </button>
                </div>
            `).join("")}
        </div>

        <hr>

        <h3>➕ THÊM CHƯƠNG MỚI</h3>

        <input
            type="text"
            id="new-chapter-title"
            placeholder="Tên chương mới..."
        >

        <textarea
            id="new-chapter-content"
            rows="10"
            placeholder="Nội dung chương mới..."
        ></textarea>

        <button onclick="addChapterToEditor('${book.id}')">
            THÊM CHƯƠNG
        </button>

        <hr>

        <button onclick="saveBookEdits('${book.id}')">
            💾 LƯU TẤT CẢ THAY ĐỔI
        </button>

        <button onclick="showAccountTab('stories')">
            QUAY LẠI
        </button>
    `;
}

// ========================================
// 20. LƯU CHỈNH SỬA TÁC PHẨM
// ========================================

async function saveBookEdits(bookId) {
    const book = allBooks.find(
        item => String(item.id) === String(bookId)
    );

    if (!book || !canEditBook(book)) {
        alert("Bạn không có quyền chỉnh sửa!");
        return;
    }

    const title = document.getElementById("edit-book-title").value.trim();
    const genre = document.getElementById("edit-book-genre").value;
    const description =
        document.getElementById("edit-book-description").value.trim();
    const status = document.getElementById("edit-book-status").value;

    if (!title) {
        alert("Tên tác phẩm không được để trống!");
        return;
    }

    const updatedChapters = [];

    for (let i = 0; i < book.chapters.length; i++) {
        const chapterTitle =
            document.getElementById(`edit-chapter-title-${i}`).value.trim();

        const chapterContent =
            document.getElementById(`edit-chapter-content-${i}`).value.trim();

        if (!chapterTitle || !chapterContent) {
            alert(`Chương ${i + 1} không được để trống!`);
            return;
        }

        updatedChapters.push({
            ...book.chapters[i],
            title: chapterTitle,
            content: chapterContent
        });
    }

    if (!updatedChapters.length) {
        alert("Tác phẩm phải có ít nhất một chương!");
        return;
    }

    try {
        const coverFile =
            document.getElementById("edit-book-cover").files[0];

        let coverUrl = book.cover;

        if (coverFile) {
            coverUrl = await uploadImage(coverFile, "book-covers");
        }

        const { error: bookError } = await db
            .from("books")
            .update({
                title,
                genre,
                description,
                status,
                cover_url: coverUrl
            })
            .eq("id", bookId);

        if (bookError) throw bookError;

        for (let i = 0; i < updatedChapters.length; i++) {
            const chapter = updatedChapters[i];

            const { error } = await db
                .from("chapters")
                .update({
                    title: chapter.title,
                    content: chapter.content
                })
                .eq("id", chapter.id);

            if (error) throw error;
        }

        await loadBooks();

        alert("Đã lưu toàn bộ thay đổi!");

        await showAccountTab("stories");

    } catch (error) {
        showError(error, "Không thể lưu thay đổi!");
    }
}

// ========================================
// 21. THÊM CHƯƠNG
// ========================================

async function addChapterToEditor(bookId) {
    const book = allBooks.find(
        item => String(item.id) === String(bookId)
    );

    if (!book || !canEditBook(book)) {
        alert("Bạn không có quyền chỉnh sửa!");
        return;
    }

    const title =
        document.getElementById("new-chapter-title").value.trim();

    const content =
        document.getElementById("new-chapter-content").value.trim();

    if (!title || !content) {
        alert("Vui lòng nhập đầy đủ tên và nội dung chương!");
        return;
    }

    const updatedChapters = [];

    for (let i = 0; i < book.chapters.length; i++) {
        const titleInput =
            document.getElementById(`edit-chapter-title-${i}`);

        const contentInput =
            document.getElementById(`edit-chapter-content-${i}`);

        if (!titleInput.value.trim() || !contentInput.value.trim()) {
            alert(`Chương ${i + 1} không được để trống!`);
            return;
        }

        updatedChapters.push({
            ...book.chapters[i],
            title: titleInput.value.trim(),
            content: contentInput.value.trim()
        });
    }

    try {
        for (const chapter of updatedChapters) {
            const { error } = await db
                .from("chapters")
                .update({
                    title: chapter.title,
                    content: chapter.content
                })
                .eq("id", chapter.id);

            if (error) throw error;
        }

        const { error } = await db
            .from("chapters")
            .insert({
                book_id: book.id,
                chapter_number: book.chapters.length + 1,
                sub_number: "",
                title,
                content
            });

        if (error) throw error;

        await loadBooks();

        const updatedBook = allBooks.find(
            item => String(item.id) === String(bookId)
        );

        renderBookEditor(updatedBook);

        alert("Đã thêm chương mới!");

    } catch (error) {
        showError(error);
    }
}

// ========================================
// 22. XÓA CHƯƠNG TRONG GIAO DIỆN SỬA
// ========================================

async function removeChapterFromEditor(bookId, chapterIndex) {
    const book = allBooks.find(
        item => String(item.id) === String(bookId)
    );

    if (!book || !canEditBook(book)) {
        alert("Bạn không có quyền chỉnh sửa!");
        return;
    }

    if (book.chapters.length <= 1) {
        alert("Tác phẩm phải có ít nhất một chương!");
        return;
    }

    if (!confirm("Bạn có chắc chắn muốn xóa chương này?")) return;

    try {
        const updatedChapters = [];

        for (let i = 0; i < book.chapters.length; i++) {
            if (i === chapterIndex) continue;

            const titleInput =
                document.getElementById(`edit-chapter-title-${i}`);

            const contentInput =
                document.getElementById(`edit-chapter-content-${i}`);

            if (!titleInput.value.trim() || !contentInput.value.trim()) {
                alert(`Chương ${i + 1} không được để trống!`);
                return;
            }

            updatedChapters.push({
                ...book.chapters[i],
                title: titleInput.value.trim(),
                content: contentInput.value.trim()
            });
        }

        for (const chapter of updatedChapters) {
            const { error } = await db
                .from("chapters")
                .update({
                    title: chapter.title,
                    content: chapter.content
                })
                .eq("id", chapter.id);

            if (error) throw error;
        }

        const chapterToDelete = book.chapters[chapterIndex];

        const { error } = await db
            .from("chapters")
            .delete()
            .eq("id", chapterToDelete.id);

        if (error) throw error;

        await loadBooks();

        const updatedBook = allBooks.find(
            item => String(item.id) === String(bookId)
        );

        renderBookEditor(updatedBook);

        alert("Đã xóa chương!");

    } catch (error) {
        showError(error);
    }
}

// ========================================
// 23. ĐỔI ẢNH ĐẠI DIỆN
// ========================================

async function changeAvatar() {
    const file = document.getElementById("new-avatar").files[0];
    const message = document.getElementById("settings-message");

    if (!currentUser) return;

    if (!file) {
        message.textContent = "Bạn chưa chọn ảnh!";
        return;
    }

    try {
        const avatarUrl = await uploadImage(file, "avatars");

        const { error } = await db
            .from("profiles")
            .update({
                avatar_url: avatarUrl
            })
            .eq("id", currentUser.id);

        if (error) throw error;

        currentUser.avatar = avatarUrl;

        await loadAccountPage();

        message.textContent = "Đổi ảnh đại diện thành công!";

    } catch (error) {
        message.textContent = error.message ||
            "Không thể đổi ảnh đại diện!";
    }
}

// ========================================
// 24. ĐỔI TÊN NGƯỜI DÙNG
// ========================================

async function changeUsername() {
    const newName =
        document.getElementById("new-username").value.trim();

    const message = document.getElementById("settings-message");

    if (!currentUser) return;

    if (!newName || newName.length < 3) {
        message.textContent =
            "Tên người dùng phải có ít nhất 3 ký tự!";
        return;
    }

    try {
        const { data: existing, error: checkError } = await db
            .from("profiles")
            .select("id")
            .ilike("username", newName)
            .neq("id", currentUser.id)
            .limit(1);

        if (checkError) throw checkError;

        if (existing && existing.length > 0) {
            message.textContent = "Tên này đã được sử dụng!";
            return;
        }

        const { error } = await db
            .from("profiles")
            .update({
                username: newName
            })
            .eq("id", currentUser.id);

        if (error) throw error;

        currentUser.username = newName;

        displayAccount();
        await loadAccountPage();

        message.textContent = "Đổi tên thành công!";

    } catch (error) {
        message.textContent =
            error.message || "Không thể đổi tên!";
    }
}

// ========================================
// 25. ĐỔI MẬT KHẨU
// ========================================

async function changePassword() {
    const oldPassword =
        document.getElementById("old-password").value;

    const newPassword =
        document.getElementById("new-password").value;

    const confirmPassword =
        document.getElementById("confirm-new-password").value;

    const message = document.getElementById("settings-message");

    if (!currentUser) return;

    if (!oldPassword || !newPassword || !confirmPassword) {
        message.textContent = "Vui lòng nhập đầy đủ thông tin!";
        return;
    }

    if (newPassword.length < 6) {
        message.textContent =
            "Mật khẩu mới phải có ít nhất 6 ký tự!";
        return;
    }

    if (newPassword !== confirmPassword) {
        message.textContent =
            "Mật khẩu nhập lại không khớp!";
        return;
    }

    try {
        const { error: loginError } = await db.auth.signInWithPassword({
            email: currentUser.email,
            password: oldPassword
        });

        if (loginError) {
            message.textContent = "Mật khẩu hiện tại không đúng!";
            return;
        }

        const { error } = await db.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;

        document.getElementById("old-password").value = "";
        document.getElementById("new-password").value = "";
        document.getElementById("confirm-new-password").value = "";

        message.textContent = "Đổi mật khẩu thành công!";

    } catch (error) {
        message.textContent =
            error.message || "Không thể đổi mật khẩu!";
    }
}

// ========================================
// 26. KHỞI ĐỘNG WEBSITE
// ========================================

document.addEventListener("DOMContentLoaded", async function () {
    try {
        await initializeSupabase();

        displayAccount();
        displayBooks();

        if (document.getElementById("account-avatar")) {
            await loadAccountPage();
        }

        if (
            document.getElementById("book-title") ||
            document.getElementById("chapter-content")
        ) {
            await openBook();
        }

        const searchInput =
            document.getElementById("search-book");

        if (searchInput) {
            searchInput.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    searchBooks();
                }
            });
        }

    } catch (error) {
        console.error("Lỗi khởi động Văn Các:", error);

        const container = document.getElementById("book-list");

        if (container) {
            container.innerHTML = `
                <p>Không thể kết nối cơ sở dữ liệu.
                Vui lòng tải lại trang sau.</p>
            `;
        }
    }
});