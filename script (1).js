/* =====================================================
   School Uniform Ordering System with Student and Owner login.
   Everything is saved in the browser (localStorage).

   IMPORTANT: this is a school project with no server, so the
   login is NOT truly secure. Anyone who knows how to open the
   browser tools can see the saved data. Real systems need a backend.
   ===================================================== */
(function () {
  "use strict";

  // ---------- 1. Settings (change the owner login here) ----------
  var OWNER_USERNAME = "owner";
  var OWNER_PASSWORD = "owner123";
  var STORAGE_KEY = "uniformLoginSystemData";
  var SESSION_KEY = "uniformLoginSession";

  var DEFAULT_PRODUCTS = [
    { id: 1, name: "School Uniform",   price: 450, stock: 30, sizes: ["S", "M", "L", "XL"] },
    { id: 2, name: "School Pants",     price: 350, stock: 25, sizes: ["S", "M", "L", "XL"] },
    { id: 3, name: "PE T-Shirt",       price: 350, stock: 40, sizes: ["S", "M", "L", "XL"] },
    { id: 4, name: "PE Jogging Pants", price: 350, stock: 35, sizes: ["S", "M", "L", "XL"] },
    { id: 5, name: "School Shoes",     price: 350, stock: 20, sizes: ["36", "37", "38", "39", "40", "41", "42"] },
    { id: 6, name: "ID Lace",          price: 150, stock: 50, sizes: ["One Size"] }
  ];

  var products = [];   // product list with current stock
  var orders = [];     // all orders
  var students = [];   // registered students: { studentId, name, passHash }
  var session = null;  // who is logged in: { role: "student", studentId, name } or { role: "owner" }
  var searchTerm = "";

  // ---------- 2. Helper functions ----------
  function $(id) { return document.getElementById(id); }
  function money(n) { return "₱" + Number(n).toFixed(2); }
  function isWholeNumber(n) { return typeof n === "number" && isFinite(n) && Math.floor(n) === n; }

  function findProduct(id) {
    for (var i = 0; i < products.length; i++) { if (products[i].id === id) return products[i]; }
    return null;
  }

  function esc(text) {   // keeps typed text from being treated as HTML
    return String(text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Turns a password into a scrambled number so it is not saved as readable text.
  // (Simple learning example only, not real security.)
  function hashPassword(text) {
    var h = 5381, s = "uniform:" + text;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; }
    return String(h);
  }

  var messageTimer = null;
  function showMessage(text, type) {
    $("message").innerHTML = '<span class="' + type + '">' + esc(text) + "</span>";
    clearTimeout(messageTimer);
    messageTimer = setTimeout(function () { $("message").innerHTML = ""; }, 4500);
  }

  function setError(fieldId, text) {
    $(fieldId + "Error").textContent = text;
    $(fieldId).classList.add("invalid");
  }

  function clearErrors(ids) {
    ids.forEach(function (id) { $(id + "Error").textContent = ""; $(id).classList.remove("invalid"); });
  }

  // ---------- 3. localStorage (safe loading and saving) ----------
  function loadState() {
    products = DEFAULT_PRODUCTS.map(function (p) {
      return { id: p.id, name: p.name, price: p.price, stock: p.stock, sizes: p.sizes.slice() };
    });
    orders = [];
    students = [];

    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { saved = null; }
    if (!saved || typeof saved !== "object") return;

    if (Array.isArray(saved.stock)) {
      saved.stock.forEach(function (s) {
        var p = s && findProduct(s.id);
        if (p && isWholeNumber(s.stock) && s.stock >= 0) p.stock = s.stock;
      });
    }
    if (Array.isArray(saved.students)) {
      saved.students.forEach(function (s) {
        if (s && typeof s.studentId === "string" && typeof s.name === "string" && typeof s.passHash === "string") {
          students.push({ studentId: s.studentId, name: s.name, passHash: s.passHash });
        }
      });
    }
    if (Array.isArray(saved.orders)) {
      saved.orders.forEach(function (o) {
        if (o && isWholeNumber(o.id) && findProduct(o.productId) && isWholeNumber(o.qty) && o.qty > 0 &&
            typeof o.name === "string" && typeof o.studentId === "string" &&
            typeof o.size === "string" && typeof o.total === "number") {
          orders.push({ id: o.id, date: String(o.date || ""), name: o.name, studentId: o.studentId,
                        productId: o.productId, size: o.size, qty: o.qty, total: o.total });
        }
      });
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        stock: products.map(function (p) { return { id: p.id, stock: p.stock }; }),
        students: students,
        orders: orders
      }));
    } catch (e) {
      showMessage("Warning: your browser blocked saving, so data will be lost on refresh.", "fail");
    }
  }

  // The login session lasts until the Logout button is clicked or the tab is closed
  function loadSession() {
    session = null;
    try {
      var s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (s && s.role === "owner") session = { role: "owner" };
      if (s && s.role === "student" && findStudent(s.studentId)) {
        session = { role: "student", studentId: s.studentId, name: findStudent(s.studentId).name };
      }
    } catch (e) { session = null; }
  }

  function saveSession() {
    try {
      if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
  }

  function findStudent(studentId) {
    var id = String(studentId).toLowerCase();
    for (var i = 0; i < students.length; i++) {
      if (students[i].studentId.toLowerCase() === id) return students[i];
    }
    return null;
  }

  // ---------- 4. Login screen: tabs, register, student login, owner login ----------
  var AUTH_FIELDS = ["loginId", "loginPass", "regName", "regId", "regPass", "regPass2", "ownerUser", "ownerPass"];

  function showTab(formId) {
    ["studentLoginForm", "registerForm", "ownerLoginForm"].forEach(function (id) {
      $(id).classList.toggle("hidden", id !== formId);
    });
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-tab") === formId);
    });
    clearErrors(AUTH_FIELDS);
  }

  function handleRegister(event) {
    event.preventDefault();
    clearErrors(AUTH_FIELDS);
    var name = $("regName").value.trim();
    var id = $("regId").value.trim();
    var pass = $("regPass").value;
    var pass2 = $("regPass2").value;
    var valid = true;

    if (!/^[A-Za-z][A-Za-z .'-]{1,49}$/.test(name)) { setError("regName", "Enter a valid name (letters only, at least 2 characters)."); valid = false; }
    if (!/^[A-Za-z0-9-]{3,20}$/.test(id)) { setError("regId", "Student ID must be 3-20 letters, numbers or dashes."); valid = false; }
    else if (findStudent(id)) { setError("regId", "This Student ID is already registered."); valid = false; }
    if (pass.length < 4) { setError("regPass", "Password must be at least 4 characters."); valid = false; }
    if (pass2 !== pass) { setError("regPass2", "Passwords do not match."); valid = false; }
    if (!valid) { showMessage("Please fix the errors in the form.", "fail"); return; }

    students.push({ studentId: id, name: name, passHash: hashPassword(pass) });
    saveState();
    $("registerForm").reset();
    $("loginId").value = id;
    showTab("studentLoginForm");
    showMessage("Account created! You can now log in.", "success");
  }

  function handleStudentLogin(event) {
    event.preventDefault();
    clearErrors(AUTH_FIELDS);
    var id = $("loginId").value.trim();
    var pass = $("loginPass").value;
    var valid = true;

    if (id === "") { setError("loginId", "Please enter your Student ID."); valid = false; }
    if (pass === "") { setError("loginPass", "Please enter your password."); valid = false; }
    if (!valid) { showMessage("Please fill in all fields.", "fail"); return; }

    var student = findStudent(id);
    if (!student || student.passHash !== hashPassword(pass)) {
      showMessage("Wrong Student ID or password.", "fail");
      return;
    }
    session = { role: "student", studentId: student.studentId, name: student.name };
    saveSession();
    $("studentLoginForm").reset();
    showView();
    showMessage("Welcome, " + student.name + "!", "success");
  }

  function handleOwnerLogin(event) {
    event.preventDefault();
    clearErrors(AUTH_FIELDS);
    var user = $("ownerUser").value.trim();
    var pass = $("ownerPass").value;
    var valid = true;

    if (user === "") { setError("ownerUser", "Please enter the username."); valid = false; }
    if (pass === "") { setError("ownerPass", "Please enter the password."); valid = false; }
    if (!valid) { showMessage("Please fill in all fields.", "fail"); return; }

    if (user !== OWNER_USERNAME || pass !== OWNER_PASSWORD) {
      showMessage("Wrong owner username or password.", "fail");
      return;
    }
    session = { role: "owner" };
    saveSession();
    $("ownerLoginForm").reset();
    showView();
    showMessage("Welcome, Owner!", "success");
  }

  function handleLogout() {
    session = null;
    saveSession();
    searchTerm = "";
    $("searchInput").value = "";
    showTab("studentLoginForm");
    showView();
    showMessage("You have been logged out.", "success");
  }

  // ---------- 5. Show the right screen for whoever is logged in ----------
  function showView() {
    var role = session ? session.role : "";
    $("loginView").classList.toggle("hidden", role !== "");
    $("studentView").classList.toggle("hidden", role !== "student");
    $("ownerView").classList.toggle("hidden", role !== "owner");
    $("userBar").classList.toggle("hidden", role === "");
    $("userLabel").textContent = role === "student" ? "Student: " + session.name : role === "owner" ? "Owner" : "";

    if (role === "student") {
      $("orderName").value = session.name;
      $("orderStudentId").value = session.studentId;
    }
    // Remove the other role's data from the page so it cannot be seen or inspected
    if (role !== "owner") {
      $("ownerOrderTable").innerHTML = "";
      $("orderCount").textContent = "";
      ["statOrders", "statSales", "statItems", "statStock"].forEach(function (id) { $(id).textContent = ""; });
    }
    if (role !== "student") { $("studentOrderTable").innerHTML = ""; }
    renderAll();
  }

  // ---------- 6. Display: products, dashboard, orders ----------
  function renderProductTable(tbodyId) {
    var html = "";
    products.forEach(function (p) {
      var stockText = p.stock === 0 ? '<span class="out">Out of stock</span>'
                    : p.stock <= 5  ? '<span class="low">' + p.stock + " (low)</span>" : p.stock;
      html += "<tr><td>" + esc(p.name) + "</td><td>" + esc(p.sizes.join(", ")) + "</td><td>" + money(p.price) + "</td><td>" + stockText + "</td></tr>";
    });
    $(tbodyId).innerHTML = html;
  }

  function renderDashboard() {
    var sales = 0, items = 0, stock = 0;
    orders.forEach(function (o) { sales += o.total; items += o.qty; });
    products.forEach(function (p) { stock += p.stock; });
    $("statOrders").textContent = orders.length;
    $("statSales").textContent = money(sales);
    $("statItems").textContent = items;
    $("statStock").textContent = stock;
  }

  function cancelButton(o) {
    return '<td><button type="button" class="btn red" data-cancel="' + o.id + '">Delete</button></td>';
  }

  function renderStudentOrders() {
    if (!session || session.role !== "student") return;   // students only
    var mine = orders.filter(function (o) { return session && o.studentId.toLowerCase() === session.studentId.toLowerCase(); });
    if (mine.length === 0) {
      $("studentOrderTable").innerHTML = '<tr><td colspan="7" class="empty-row">You have no orders yet.</td></tr>';
      return;
    }
    var html = "";
    mine.forEach(function (o) {
      var p = findProduct(o.productId);
      html += "<tr><td>" + o.id + "</td><td>" + esc(o.date) + "</td><td>" + esc(p ? p.name : "") + "</td><td>" + esc(o.size) +
              "</td><td>" + o.qty + "</td><td>" + money(o.total) + "</td>" + cancelButton(o) + "</tr>";
    });
    $("studentOrderTable").innerHTML = html;
  }

  function renderOwnerOrders() {
    if (!session || session.role !== "owner") return;     // OWNER ONLY: never build this table for anyone else
    var term = searchTerm.toLowerCase();
    var list = orders.filter(function (o) {
      return o.name.toLowerCase().indexOf(term) !== -1 || o.studentId.toLowerCase().indexOf(term) !== -1;
    });
    $("orderCount").textContent = term ? "Showing " + list.length + " of " + orders.length + " orders" : orders.length + " order(s)";

    if (list.length === 0) {
      $("ownerOrderTable").innerHTML = '<tr><td colspan="9" class="empty-row">' +
        (orders.length === 0 ? "No orders yet." : "No orders match your search.") + "</td></tr>";
      return;
    }
    var html = "";
    list.forEach(function (o) {
      var p = findProduct(o.productId);
      html += "<tr><td>" + o.id + "</td><td>" + esc(o.date) + "</td><td>" + esc(o.name) + "</td><td>" + esc(o.studentId) +
              "</td><td>" + esc(p ? p.name : "") + "</td><td>" + esc(o.size) + "</td><td>" + o.qty + "</td><td>" + money(o.total) +
              "</td>" + cancelButton(o) + "</tr>";
    });
    $("ownerOrderTable").innerHTML = html;
  }

  // Refresh everything on screen after any action
  function renderAll() {
    if (!session) return;
    if (session.role === "student") {
      renderProductTable("studentProductTable");
      renderProductSelect();
      renderSizeSelect(true);
      updateTotal();
      renderStudentOrders();
    } else {
      renderDashboard();
      renderProductTable("ownerProductTable");
      renderOwnerOrders();
    }
  }

  // ---------- 7. Student order form ----------
  function renderProductSelect() {
    var chosen = $("product").value;
    var html = '<option value="">-- Select product --</option>';
    products.forEach(function (p) {
      html += '<option value="' + p.id + '">' + esc(p.name) + " - " + money(p.price) + " (stock: " + p.stock + ")</option>";
    });
    $("product").innerHTML = html;
    $("product").value = chosen;
  }

  function renderSizeSelect(keepChoice) {
    var chosenSize = keepChoice ? $("size").value : "";
    var product = findProduct(Number($("product").value));
    var html = '<option value="">-- Select size --</option>';
    if (product) { product.sizes.forEach(function (s) { html += "<option>" + esc(s) + "</option>"; }); }
    $("size").innerHTML = html;
    $("size").value = chosenSize;
  }

  function updateTotal() {
    var product = findProduct(Number($("product").value));
    var qty = Number($("quantity").value);
    $("totalPrice").textContent = money(product && qty > 0 ? product.price * qty : 0);
  }

  function clearOrderForm() {
    clearErrors(["product", "size", "quantity"]);
    $("product").value = "";
    $("quantity").value = 1;
    renderSizeSelect(false);
    updateTotal();
  }

  function handlePlaceOrder(event) {
    event.preventDefault();
    if (!session || session.role !== "student") return;
    clearErrors(["product", "size", "quantity"]);

    var product = findProduct(Number($("product").value));
    var size = $("size").value;
    var qtyText = $("quantity").value.trim();
    var qty = Number(qtyText);
    var valid = true;

    if (!product) { setError("product", "Please choose a product."); valid = false; }
    else if (!size || product.sizes.indexOf(size) === -1) { setError("size", "Please choose a size."); valid = false; }
    if (qtyText === "" || !isWholeNumber(qty) || qty < 1) { setError("quantity", "Quantity must be a whole number of 1 or more."); valid = false; }
    if (!valid) { showMessage("Please fix the errors in the form.", "fail"); return; }

    if (qty > product.stock) {
      var text = product.stock === 0 ? product.name + " is out of stock."
                                     : "Not enough stock. Only " + product.stock + " " + product.name + " left.";
      setError("quantity", text);
      showMessage(text, "fail");
      return;
    }

    var nextId = 1;
    orders.forEach(function (o) { if (o.id >= nextId) nextId = o.id + 1; });
    var total = product.price * qty;

    product.stock -= qty;   // reduce stock
    orders.push({ id: nextId, date: new Date().toLocaleString(), name: session.name, studentId: session.studentId,
                  productId: product.id, size: size, qty: qty, total: total });

    saveState();
    clearOrderForm();
    renderAll();
    showMessage("Order #" + nextId + " placed! Total: " + money(total), "success");
  }

  // ---------- 8. Delete (cancel) an order ----------
  function handleDeleteClick(event) {
    var btn = event.target.closest ? event.target.closest("[data-cancel]") : null;
    if (!btn || !session) return;

    var id = Number(btn.getAttribute("data-cancel"));
    var order = null;
    orders.forEach(function (o) { if (o.id === id) order = o; });
    if (!order) return;

    // A student may only delete their own orders. The owner may delete any order.
    if (session.role === "student" && order.studentId.toLowerCase() !== session.studentId.toLowerCase()) return;

    if (!window.confirm("Delete order #" + id + " (" + order.name + ")? The stock will be restored.")) return;

    var product = findProduct(order.productId);
    if (product) product.stock += order.qty;                       // restore stock
    orders = orders.filter(function (o) { return o.id !== id; });  // remove order

    saveState();
    renderAll();
    showMessage("Order #" + id + " deleted. Stock restored.", "success");
  }

  // ---------- 9. Owner: search orders ----------
  function handleSearch(event) {
    event.preventDefault();
    if (!session || session.role !== "owner") return;
    searchTerm = $("searchInput").value.trim();
    renderOwnerOrders();
  }

  // ---------- 10. Start: connect every listener once ----------
  function init() {
    loadState();
    loadSession();

    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () { showTab(tab.getAttribute("data-tab")); });
    });
    $("registerForm").addEventListener("submit", handleRegister);
    $("studentLoginForm").addEventListener("submit", handleStudentLogin);
    $("ownerLoginForm").addEventListener("submit", handleOwnerLogin);
    $("logoutBtn").addEventListener("click", handleLogout);

    $("orderForm").addEventListener("submit", handlePlaceOrder);
    $("clearBtn").addEventListener("click", clearOrderForm);
    $("product").addEventListener("change", function () { renderSizeSelect(false); updateTotal(); });
    $("quantity").addEventListener("input", updateTotal);
    $("studentOrderTable").addEventListener("click", handleDeleteClick);
    $("ownerOrderTable").addEventListener("click", handleDeleteClick);

    $("searchForm").addEventListener("submit", handleSearch);
    $("searchInput").addEventListener("input", function () { searchTerm = $("searchInput").value.trim(); renderOwnerOrders(); });

    showView();
  }

  init();
})();
