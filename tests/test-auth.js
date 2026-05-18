// Test authentication for CareerPilot
// Run this in browser console to debug auth issues

function testAuth() {
  console.log('🔍 Testing CareerPilot Authentication...');
  
  // Check if token exists
  const token = localStorage.getItem('token');
  console.log('Token exists:', !!token);
  
  if (token) {
    console.log('Token preview:', token.substring(0, 20) + '...');
    
    // Try to decode JWT payload (basic check)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      console.log('Token payload:', payload);
      console.log('Token expiry:', new Date(payload.exp * 1000));
      console.log('Is expired:', payload.exp * 1000 < Date.now());
    } catch (e) {
      console.log('❌ Invalid token format');
    }
  }
  
  // Test API call
  console.log('🧪 Testing API call...');
  
  fetch('/api/resume', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  .then(response => {
    console.log('API Response status:', response.status);
    console.log('API Response headers:', Object.fromEntries(response.headers.entries()));
    return response.json();
  })
  .then(data => {
    console.log('✅ API Response data:', data);
  })
  .catch(error => {
    console.log('❌ API Error:', error);
  });
}

// Run the test
testAuth();