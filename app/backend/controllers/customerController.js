const pool = require('../db');
const controller = {};

const handleDatabaseError = (res, error) => {
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Email already exists' });
    }

    console.error('Database request failed:', error);
    return res.status(500).json({ error: 'Database request failed' });
};

const getCustomerData = body => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return null;
    }

    const { name, address, phone, email } = body;
    if (typeof name !== 'string' || !name.trim()
        || typeof address !== 'string' || !address.trim()) {
        return null;
    }

    return {
        name: name.trim(),
        address: address.trim(),
        phone: phone || null,
        email: email || null
    };
};

// GET all customers
controller.list = async (req, res) => {
    try {
        const [customers] = await pool.query('SELECT * FROM customer');
        res.json(customers);
    } catch (error) {
        handleDatabaseError(res, error);
    }
};

// CREATE customer
controller.save = async (req, res) => {
    const data = getCustomerData(req.body);
    if (!data) {
        return res.status(400).json({ error: 'Name and address are required' });
    }

    try {
        const [result] = await pool.execute(
            'INSERT INTO customer (name, address, phone, email) VALUES (?, ?, ?, ?)',
            [data.name, data.address, data.phone, data.email]
        );
        res.status(201).json({
            message: "Customer created",
            id: result.insertId
        });
    } catch (error) {
        handleDatabaseError(res, error);
    }
};

// DELETE customer
controller.delete = async (req, res) => {
    const { id } = req.params;

    try {
        await pool.execute('DELETE FROM customer WHERE id = ?', [id]);
        res.json({ message: "Customer deleted" });
    } catch (error) {
        handleDatabaseError(res, error);
    }
};

// GET one customer
controller.getOne = async (req, res) => {
    const { id } = req.params;

    try {
        const [customers] = await pool.execute(
            'SELECT * FROM customer WHERE id = ?',
            [id]
        );

        if (customers.length === 0) {
            return res.status(404).json({ message: "Customer not found" });
        }

        res.json(customers[0]);
    } catch (error) {
        handleDatabaseError(res, error);
    }
};

// UPDATE customer
controller.update = async (req, res) => {
    const { id } = req.params;
    const data = getCustomerData(req.body);
    if (!data) {
        return res.status(400).json({ error: 'Name and address are required' });
    }

    try {
        await pool.execute(
            'UPDATE customer SET name = ?, address = ?, phone = ?, email = ? WHERE id = ?',
            [data.name, data.address, data.phone, data.email, id]
        );
        res.json({ message: "Customer updated" });
    } catch (error) {
        handleDatabaseError(res, error);
    }
};

module.exports = controller;
