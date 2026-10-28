const express = require('express');
const router = express.Router();

const customerController = require('../controllers/customerController');

// REST API routes
router.get('/customers', customerController.list);
router.get('/customers/:id', customerController.getOne);
router.post('/customers', customerController.save);
router.put('/customers/:id', customerController.update);
router.delete('/customers/:id', customerController.delete);

module.exports = router;
