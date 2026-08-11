const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const agentController = require('../controllers/agentController');

router.get('/', auth, agentController.listAgents);
router.get('/:agentName', auth, agentController.getAgent);
router.post('/:agentName/:toolName', auth, agentController.executeTool);

module.exports = router;
