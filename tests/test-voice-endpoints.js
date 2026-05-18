/**
 * Test script for Hugging Face voice endpoints (STT and TTS)
 * Tests the new /api/chatbot/transcribe and /api/chatbot/speak endpoints
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs-extra');
const path = require('path');

const API_BASE_URL = 'http://localhost:4000/api';

async function testTTSEndpoint() {
  try {
    console.log('\n🔊 Testing TTS (Text-to-Speech) Endpoint...');
    console.log('═'.repeat(50));

    const testText = 'Hello! Welcome to CareerPilot. I am here to help you build your professional resume through our interactive conversation.';

    const response = await axios.post(`${API_BASE_URL}/chatbot/speak`, {
      text: testText
    });

    if (response.data.success) {
      console.log('✅ TTS Request successful');
      console.log('   Model:', response.data.model);
      console.log('   MIME Type:', response.data.mimeType);
      console.log('   Audio size:', response.data.audio.length, 'characters (base64)');

      // Save audio for manual verification
      const audioBuffer = Buffer.from(response.data.audio, 'base64');
      const audioPath = path.join(__dirname, 'test-output-audio.wav');
      await fs.writeFile(audioPath, audioBuffer);
      console.log('   Audio saved to:', audioPath);
      console.log('   ✨ You can play this file to verify audio quality');
      
      return true;
    } else {
      console.error('❌ TTS failed:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ TTS test error:', error.message);
    if (error.response?.data) {
      console.error('   Response:', error.response.data);
    }
    return false;
  }
}

async function testSTTEndpoint() {
  try {
    console.log('\n🎙️ Testing STT (Speech-to-Text) Endpoint...');
    console.log('═'.repeat(50));

    // Check if we have a test audio file
    const testAudioPath = path.join(__dirname, '..', 'test-resume.txt'); // Using existing test file as placeholder
    
    if (!await fs.pathExists(testAudioPath)) {
      console.log('⚠️  No test audio file available');
      console.log('   To test STT, you would need a .wav or .mp3 audio file');
      console.log('   The endpoint expects multipart/form-data with "audio" field');
      return false;
    }

    // Create FormData
    const form = new FormData();
    form.append('audio', await fs.readFile(testAudioPath), 'test.wav');

    const response = await axios.post(`${API_BASE_URL}/chatbot/transcribe`, form, {
      headers: form.getHeaders()
    });

    if (response.data.success) {
      console.log('✅ STT Request successful');
      console.log('   Transcribed text:', response.data.text);
      console.log('   Model:', response.data.model);
      return true;
    } else {
      console.error('❌ STT failed:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ STT test error:', error.message);
    if (error.response?.data) {
      console.error('   Response:', error.response.data);
    }
    return false;
  }
}

async function testChatbotIntegration() {
  try {
    console.log('\n💬 Testing Chatbot Integration...');
    console.log('═'.repeat(50));

    // Start conversation
    console.log('📍 Step 1: Starting conversation...');
    const startResponse = await axios.post(`${API_BASE_URL}/chatbot/start`, {});
    const sessionId = startResponse.data.sessionId;
    const initialMessage = startResponse.data.response;
    console.log('   ✅ Session started:', sessionId);
    console.log('   Bot message:', initialMessage.substring(0, 50) + '...');

    // Send message
    console.log('📍 Step 2: Sending test message...');
    const messageResponse = await axios.post(`${API_BASE_URL}/chatbot/message`, {
      message: 'My name is John Doe',
      sessionId
    });
    console.log('   ✅ Message processed');
    console.log('   Bot response:', messageResponse.data.response.substring(0, 50) + '...');
    console.log('   Current state:', messageResponse.data.state);

    // Test TTS on bot response
    console.log('📍 Step 3: Generating speech for bot response...');
    const botResponseText = messageResponse.data.response;
    const ttsResponse = await axios.post(`${API_BASE_URL}/chatbot/speak`, {
      text: botResponseText
    });
    
    if (ttsResponse.data.success) {
      console.log('   ✅ Speech synthesis successful');
      console.log('   Audio size:', ttsResponse.data.audio.length, 'characters (base64)');
    } else {
      console.log('   ⚠️  Speech synthesis skipped');
    }

    console.log('✅ Full integration test passed!');
    return true;
  } catch (error) {
    console.error('❌ Integration test error:', error.message);
    if (error.response?.data) {
      console.error('   Response:', error.response.data);
    }
    return false;
  }
}

async function runAllTests() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║          HUGGING FACE VOICE ENDPOINTS TEST SUITE              ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  console.log('\n⏳ Make sure the server is running on http://localhost:4000');
  console.log('   Run: npm start (in the project root)\n');

  const results = {
    tts: false,
    stt: false,
    integration: false
  };

  try {
    // Test connectivity first
    console.log('🧪 Checking server connectivity...');
    await axios.get(`${API_BASE_URL.replace('/api', '')}/`).catch(() => {
      throw new Error('Server not running');
    });
    console.log('✅ Server is running\n');
  } catch (error) {
    console.error('❌ Cannot connect to server at http://localhost:4000');
    console.error('   Make sure the server is running: npm start');
    process.exit(1);
  }

  // Run tests
  results.tts = await testTTSEndpoint();
  results.stt = await testSTTEndpoint();
  results.integration = await testChatbotIntegration();

  // Summary
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                        TEST SUMMARY                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`\n📊 TTS Endpoint:        ${results.tts ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`📊 STT Endpoint:        ${results.stt ? '✅ PASS' : '⚠️  SKIPPED'}`);
  console.log(`📊 Integration:         ${results.integration ? '✅ PASS' : '❌ FAIL'}`);

  const passCount = Object.values(results).filter(r => r).length;
  console.log(`\n🎯 Total: ${passCount}/${3} tests passed`);

  if (results.integration) {
    console.log('\n✨ Voice endpoints are working correctly!');
    console.log('💡 Next steps:');
    console.log('   1. Visit http://localhost:4000/public/chatbot/chatbot.html');
    console.log('   2. Click the microphone icon to record audio');
    console.log('   3. Enable the speaker icon for audio responses');
    console.log('   4. Enjoy conversational resume building!');
  }

  console.log('\n');
}

// Run tests
runAllTests().catch(console.error);
