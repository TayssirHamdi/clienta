const API_URL = "/api/customers";

let actionsCount = 0;
let customersList = [];

window.onload = loadCustomers;

async function requestJson(url, options) {
    const response = await fetch(url, options);

    if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const errorBody = contentType.includes("application/json")
            ? await response.json()
            : null;
        throw new Error(
            errorBody?.error || errorBody?.message || `Request failed (${response.status})`
        );
    }

    return response.json();
}

function loadCustomers() {
    requestJson(API_URL)
        .then(customers => {
            customersList = customers;
            document.getElementById("totalCustomers").innerText = customers.length;
            document.getElementById("recentCustomer").innerText =
                customers.length > 0 ? customers[customers.length - 1].name : "—";
            renderCustomers();
        })
        .catch(err => {
            console.error("Unable to load customers:", err);
            Swal.fire("Unable to load customers", err.message, "error");
        });
}

function renderCustomers(query = "") {
    const tbody = document.getElementById("customerTable");
    const normalizedQuery = query.trim().toLowerCase();
    const filteredCustomers = customersList.filter(customer =>
        [customer.name, customer.email, customer.address, customer.phone]
            .some(value => String(value || "").toLowerCase().includes(normalizedQuery))
    );

    tbody.replaceChildren();

    if (filteredCustomers.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        const emptyState = document.createElement("div");
        const icon = document.createElement("i");
        const title = document.createElement("strong");
        const message = document.createElement("span");

        cell.colSpan = 6;
        emptyState.className = "empty-state";
        icon.className = normalizedQuery ? "fa-solid fa-magnifying-glass" : "fa-regular fa-address-book";
        icon.setAttribute("aria-hidden", "true");
        title.textContent = normalizedQuery ? "No matches found" : "Your directory is ready";
        message.textContent = normalizedQuery
            ? "Try another name, address, or phone number."
            : "Add your first customer above to get started.";
        emptyState.append(icon, title, message);
        cell.append(emptyState);
        row.append(cell);
        tbody.append(row);
        return;
    }

    filteredCustomers.forEach((customer, index) => {
        const row = document.createElement("tr");
        const numberCell = document.createElement("td");
        const nameCell = document.createElement("td");
        const identity = document.createElement("div");
        const emailCell = document.createElement("td");
        const addressCell = document.createElement("td");
        const phoneCell = document.createElement("td");
        const actionsCell = document.createElement("td");
        const avatar = document.createElement("span");
        const name = document.createElement("span");
        const editButton = document.createElement("button");
        const deleteButton = document.createElement("button");

        row.className = "fade-in";
        numberCell.textContent = String(index + 1).padStart(2, "0");
        avatar.className = "customer-avatar";
        avatar.textContent = String(customer.name || "?").trim().charAt(0).toUpperCase();
        avatar.setAttribute("aria-hidden", "true");
        name.className = "customer-name";
        name.textContent = customer.name;
        identity.className = "customer-identity";
        identity.append(avatar, name);
        nameCell.append(identity);
        emailCell.textContent = customer.email || "—";
        addressCell.textContent = customer.address;
        phoneCell.textContent = customer.phone;

        editButton.type = "button";
        editButton.className = "btn btn-success btn-sm";
        editButton.setAttribute("aria-label", `Edit ${customer.name}`);
        editButton.title = "Edit customer";
        editButton.innerHTML = '<i class="fa-solid fa-pen"></i>';
        editButton.addEventListener("click", () =>
            openUpdateModal(customer.id, customer.name, customer.email, customer.address, customer.phone)
        );

        deleteButton.type = "button";
        deleteButton.className = "btn btn-danger btn-sm";
        deleteButton.setAttribute("aria-label", `Delete ${customer.name}`);
        deleteButton.title = "Delete customer";
        deleteButton.innerHTML = '<i class="fa-regular fa-trash-can"></i>';
        deleteButton.addEventListener("click", () => deleteCustomer(customer.id, customer.name));

        actionsCell.append(editButton, deleteButton);
        row.append(numberCell, nameCell, emailCell, addressCell, phoneCell, actionsCell);
        tbody.append(row);
    });
}

function searchCustomer() {
    renderCustomers(document.getElementById("search").value);
}

function addCustomer() {
    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value.trim();
    const address = document.getElementById("address").value;
    const phone = document.getElementById("phone").value;

    if (!name || !address || !phone) return Swal.fire("Oops", "Please fill all fields", "warning");

    requestJson(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email || null, address, phone })
    })
    .then(() => {
        document.getElementById("name").value = "";
        document.getElementById("email").value = "";
        document.getElementById("address").value = "";
        document.getElementById("phone").value = "";
        actionsCount++;
        document.getElementById("actionsToday").innerText = actionsCount;
        loadCustomers();
        Swal.fire("Success", "Customer added!", "success");
    })
    .catch(err => {
        console.error("Unable to add customer:", err);
        Swal.fire("Unable to add customer", err.message, "error");
    });
}

function openUpdateModal(id, name, email, address, phone) {
    $("#updateModal").modal("show");
    document.getElementById("update-id").value = id;
    document.getElementById("update-name").value = name;
    document.getElementById("update-email").value = email || "";
    document.getElementById("update-address").value = address;
    document.getElementById("update-phone").value = phone;
}

function saveUpdate() {
    const id = document.getElementById("update-id").value;
    const name = document.getElementById("update-name").value;
    const email = document.getElementById("update-email").value.trim();
    const address = document.getElementById("update-address").value;
    const phone = document.getElementById("update-phone").value;

    requestJson(`${API_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email || null, address, phone })
    })
    .then(() => {
        $("#updateModal").modal("hide");
        actionsCount++;
        document.getElementById("actionsToday").innerText = actionsCount;
        loadCustomers();
        Swal.fire("Updated", "Customer details updated", "success");
    })
    .catch(err => {
        console.error("Unable to update customer:", err);
        Swal.fire("Unable to update customer", err.message, "error");
    });
}

function deleteCustomer(id, name) {
    Swal.fire({
        title: `Delete ${name}?`,
        text: "This cannot be undone!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#246c58",
        cancelButtonColor: "#8b9690",
        confirmButtonText: "Yes, delete it!"
    }).then(result => {
        if (result.isConfirmed) {
            requestJson(`${API_URL}/${id}`, { method: "DELETE" })
                .then(() => {
                    actionsCount++;
                    document.getElementById("actionsToday").innerText = actionsCount;
                    loadCustomers();
                    Swal.fire("Deleted!", "Customer removed", "success");
                })
                .catch(err => {
                    console.error("Unable to delete customer:", err);
                    Swal.fire("Unable to delete customer", err.message, "error");
                });
        }
    });
}
