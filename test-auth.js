// test-auth.js - Test backend authentication directly
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testAuth() {
  console.log('🔐 Testing Backend Authentication...\n');
  
  try {
    // Test 1: Check if server is responding
    console.log('1. Testing server health...');
    const healthResponse = await fetch('http://localhost:5000/health');
    const healthData = await healthResponse.json();
    console.log('✅ Server health:', healthData.status);
    
    // Test 2: Try login with existing user
    console.log('\n2. Testing login...');
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'tester1',
        password: 'password123' // Change this to your actual password
      })
    });
    
    const loginData = await loginResponse.json();
    console.log('Login response status:', loginResponse.status);
    console.log('Login response data:', loginData);
    
    if (loginData.success) {
      console.log('✅ Backend authentication working!');
      
      // Test 3: Try accessing protected route
      console.log('\n3. Testing protected route...');
      const profileResponse = await fetch('http://localhost:5000/api/auth/profile', {
        headers: { 'Authorization': `Bearer ${loginData.token}` }
      });
      
      const profileData = await profileResponse.json();
      console.log('Profile response:', profileData);
      
    } else {
      console.log('❌ Backend login failed:', loginData.message);
    }
    
  } catch (error) {
    console.error('❌ Connection error:', error.message);
  }
}

testAuth();