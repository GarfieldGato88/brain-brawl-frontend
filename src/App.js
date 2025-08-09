import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './App.css';

// Updated API configuration for live backend
const API_BASE_URL = https://brain-brawl-backend-5wdc.onrender.com ;
const SOCKET_URL = https://brain-brawl-backend-5wdc.onrender.com ;

console.log('API Configuration:', {
  API_BASE_URL,
  SOCKET_URL,
  NODE_ENV: process.env.NODE_ENV
});

function App() {
  // Authentication states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authData, setAuthData] = useState({ username: '', email: '', password: '' });

  // Game states
  const [gameState, setGameState] = useState('dashboard');
  const [room, setRoom] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [questionResults, setQuestionResults] = useState(null);
  const [gameResults, setGameResults] = useState(null);

  // Visual feedback states
  const [feedbackType, setFeedbackType] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // Refs
  const socketRef = useRef(null);
  const timerRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);

  // Fixed: Fetch updated user profile with proper async declaration
  const fetchUserProfile = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      console.log('📊 Fetching user profile...');
      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUserData(data.user);
          console.log('✅ Profile updated');
        }
      } else if (response.status === 401) {
        // Token expired, logout
        console.log('🔑 Token expired, logging out...');
        logout();
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  }, []); // Empty dependency array is correct here

  // Fixed: Setup socket event listeners with proper dependencies
  const setupSocketListeners = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;

    // Connection status events
    socket.on('connect', () => {
      console.log('✅ Connected to backend:', socket.id);
      setConnectionStatus('connected');
    });

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from backend');
      setConnectionStatus('disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('🔴 Connection error:', error);
      setConnectionStatus('error');
    });

    socket.on('room_created', (data) => {
      if (data.success) {
        setRoom(data.room);
        setGameState('lobby');
      } else {
        alert('Failed to create room: ' + data.error);
      }
    });

    socket.on('room_joined', (data) => {
      if (data.success) {
        setRoom(data.room);
        setGameState('lobby');
      } else {
        alert('Failed to join room: ' + data.error);
      }
    });

    socket.on('player_joined', (data) => {
      setRoom(data.room);
    });

    socket.on('player_left', (data) => {
      setRoom(data.room);
    });

    socket.on('game_started', (data) => {
      setGameState('game');
      setCurrentQuestion(null);
      setHasAnswered(false);
      setSelectedAnswer(null);
    });

    socket.on('new_question', (data) => {
      console.log('Received new question:', data);
      setCurrentQuestion(data);
      setSelectedAnswer(null);
      setHasAnswered(false);
      setTimeRemaining(30);
      setQuestionResults(null);
      setGameState('game');
      startTimer();
    });

    socket.on('player_answered', (data) => {
      console.log(`${data.username} answered (${data.playersAnswered}/${data.totalPlayers})`);
    });

    socket.on('question_results', (data) => {
      console.log('Received question results:', data);
      setQuestionResults(data);
      setGameState('question-results');
      clearInterval(timerRef.current);
      
      const userResult = data.results?.find(r => r.username === userData?.username);
      if (userResult) {
        setFeedbackType(userResult.isCorrect ? 'correct' : 'wrong');
        setShowFeedback(true);
        
        feedbackTimeoutRef.current = setTimeout(() => {
          setShowFeedback(false);
          setFeedbackType(null);
        }, 4000);
      }
    });

    socket.on('game_ended', (data) => {
      setGameResults(data);
      setGameState('results');
      clearInterval(timerRef.current);
      fetchUserProfile();
    });

    socket.on('room_closing', (data) => {
      alert(data.message);
    });

    socket.on('force_redirect', (data) => {
      setGameState('dashboard');
      setRoom(null);
      setCurrentQuestion(null);
      setQuestionResults(null);
      setGameResults(null);
    });

    socket.on('game_error', (data) => {
      alert('Game Error: ' + data.error);
    });
  }, [userData, fetchUserProfile]); // Added fetchUserProfile to dependencies

  // Initialize socket connection
  useEffect(() => {
    if (isLoggedIn && !socketRef.current) {
      console.log('🔌 Connecting to Socket.io server:', SOCKET_URL);
      
      socketRef.current = io(SOCKET_URL, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        forceNew: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        timeout: 10000
      });
      
      setupSocketListeners();
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      clearInterval(timerRef.current);
      clearTimeout(feedbackTimeoutRef.current);
    };
  }, [isLoggedIn, setupSocketListeners]);

  // Timer management
  const startTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Enhanced authentication functions with better error handling
  const handleAuth = async () => {
    try {
      console.log(`🔐 Attempting ${authMode}...`);
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(authData)
      });

      const data = await response.json();
      console.log('Auth response:', data);
      
      if (response.ok && data.success) {
        localStorage.setItem('token', data.token);
        setUserData(data.user);
        setIsLoggedIn(true);
        console.log('✅ Authentication successful');
      } else {
        console.error('❌ Authentication failed:', data);
        alert(data.message || 'Authentication failed');
      }
    } catch (error) {
      console.error('🔴 Connection error:', error);
      alert('Connection error: Unable to reach server. Please check your internet connection.');
    }
  };

  // Fixed: Check for existing token on load with proper dependency
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      console.log('🔑 Found existing token, attempting auto-login...');
      fetchUserProfile().then(() => {
        setIsLoggedIn(true);
      });
    }
  }, [fetchUserProfile]); // Added fetchUserProfile to dependencies

  // Game functions
  const createRoom = () => {
    if (socketRef.current && userData) {
      console.log('🏠 Creating room...');
      socketRef.current.emit('create_room', userData);
    } else {
      alert('Not connected to server. Please refresh the page and try again.');
    }
  };

  const joinRoom = () => {
    if (socketRef.current && userData && roomCode.trim()) {
      console.log('🚪 Joining room:', roomCode.trim().toUpperCase());
      socketRef.current.emit('join_room', {
        roomCode: roomCode.trim().toUpperCase(),
        userData: userData
      });
    } else if (!roomCode.trim()) {
      alert('Please enter a room code');
    } else {
      alert('Not connected to server. Please refresh the page and try again.');
    }
  };

  const startGame = () => {
    if (socketRef.current) {
      console.log('🚀 Starting game...');
      socketRef.current.emit('start_game');
    }
  };

  const submitAnswer = (option) => {
    if (hasAnswered || !currentQuestion) return;
    
    console.log('📝 Submitting answer:', option);
    setSelectedAnswer(option);
    setHasAnswered(true);
    socketRef.current.emit('submit_answer', { selectedOption: option });
  };

  const leaveRoom = () => {
    if (socketRef.current) {
      console.log('🚪 Leaving room...');
      socketRef.current.emit('leave_room');
    }
    setGameState('dashboard');
    setRoom(null);
    setCurrentQuestion(null);
    setQuestionResults(null);
    setGameResults(null);
  };

  const logout = () => {
    console.log('👋 Logging out...');
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setUserData(null);
    setGameState('dashboard');
    setConnectionStatus('disconnected');
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const backToDashboard = () => {
    setGameState('dashboard');
    setRoom(null);
    setCurrentQuestion(null);
    setQuestionResults(null);
    setGameResults(null);
  };

  // Calculate user level based on XP (DuoLingo style)
  const getUserLevel = (xp) => {
    return Math.floor((xp || 0) / 100) + 1;
  };

  const getXPProgress = (xp) => {
    const currentXP = (xp || 0) % 100;
    return (currentXP / 100) * 100;
  };

  // Connection status indicator
  const renderConnectionStatus = () => (
    <div className={`connection-status ${connectionStatus}`}>
      {connectionStatus === 'connected' && '🟢 Connected'}
      {connectionStatus === 'disconnected' && '🔴 Disconnected'}
      {connectionStatus === 'error' && '⚠️ Connection Error'}
    </div>
  );

  // Render functions with DuoLingo styling
  const renderAuth = () => (
    <div className="auth-container">
      <div className="llama-mascot">🦙</div>
      <h1>🧠 Brain Brawl</h1>
      
      {/* Debug info removed - connection working! */}
      
      <div className="auth-form bounce-in">
        <h2>{authMode === 'login' ? 'Welcome Back!' : 'Join the Battle!'}</h2>
        
        <input
          type="text"
          placeholder="Username"
          value={authData.username}
          onChange={(e) => setAuthData({...authData, username: e.target.value})}
        />
        
        {authMode === 'register' && (
          <input
            type="email"
            placeholder="Email (optional)"
            value={authData.email}
            onChange={(e) => setAuthData({...authData, email: e.target.value})}
          />
        )}
        
        <input
          type="password"
          placeholder="Password"
          value={authData.password}
          onChange={(e) => setAuthData({...authData, password: e.target.value})}
        />
        
        <button onClick={handleAuth}>
          {authMode === 'login' ? 'Start Learning!' : 'Create Account'}
        </button>
        
        <p>
          {authMode === 'login' ? "New to Brain Brawl? " : "Already have an account? "}
          <span 
            className="auth-switch"
            onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
          >
            {authMode === 'login' ? 'Sign Up' : 'Log In'}
          </span>
        </p>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="dashboard">
      <div className="floating-xp">
        ⭐ Level {getUserLevel(userData?.xp)}
      </div>
      <div className="floating-gems">
        💎 {userData?.gems || 0}
      </div>
      
      {/* Connection status indicator */}
      {renderConnectionStatus()}
      
      <div className="dashboard-header">
        <h1>🧠 Brain Brawl</h1>
        <button onClick={logout} className="logout-btn">Logout</button>
      </div>
      
      <div className="user-stats slide-in-left">
        <h2>Welcome back, {userData?.username}! 🎉</h2>
        
        {/* DuoLingo-style XP Progress Bar */}
        <div className="xp-progress-section">
          <div className="level-info">
            <span className="current-level">Level {getUserLevel(userData?.xp)}</span>
            <span className="xp-text">{(userData?.xp || 0) % 100} / 100 XP</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${getXPProgress(userData?.xp)}%` }}
            ></div>
          </div>
        </div>
        
        <div className="stats-grid">
          <div className="stat-card bounce-in" style={{animationDelay: '0.1s'}}>
            <div className="stat-icon">⭐</div>
            <div className="stat-value">{userData?.xp || 0}</div>
            <div className="stat-label">XP Points</div>
          </div>
          <div className="stat-card bounce-in" style={{animationDelay: '0.2s'}}>
            <div className="stat-icon">💎</div>
            <div className="stat-value">{userData?.gems || 0}</div>
            <div className="stat-label">Gems</div>
          </div>
          <div className="stat-card bounce-in" style={{animationDelay: '0.3s'}}>
            <div className="stat-icon">🎮</div>
            <div className="stat-value">{userData?.games_played || 0}</div>
            <div className="stat-label">Games Played</div>
          </div>
          <div className="stat-card bounce-in" style={{animationDelay: '0.4s'}}>
            <div className="stat-icon">🏆</div>
            <div className="stat-value">{userData?.games_won || 0}</div>
            <div className="stat-label">Games Won</div>
          </div>
          <div className="stat-card bounce-in" style={{animationDelay: '0.5s'}}>
            <div className="stat-icon">📊</div>
            <div className="stat-value">{userData?.total_score || 0}</div>
            <div className="stat-label">Total Score</div>
          </div>
          <div className="stat-card bounce-in" style={{animationDelay: '0.6s'}}>
            <div className="stat-icon">🔥</div>
            <div className="stat-value">{userData?.current_streak || 0}</div>
            <div className="stat-label">Current Streak</div>
          </div>
        </div>
        
        {/* DuoLingo-style Achievement Section */}
        <div className="achievements-section">
          <h3>Recent Achievements 🏅</h3>
          <div className="achievements-grid">
            {(userData?.games_won || 0) > 0 && (
              <div className="achievement-badge">
                <span className="achievement-icon">🥇</span>
                <span className="achievement-text">First Victory!</span>
              </div>
            )}
            {(userData?.current_streak || 0) >= 3 && (
              <div className="achievement-badge">
                <span className="achievement-icon">🔥</span>
                <span className="achievement-text">On Fire!</span>
              </div>
            )}
            {(userData?.games_played || 0) >= 5 && (
              <div className="achievement-badge">
                <span className="achievement-icon">🎯</span>
                <span className="achievement-text">Dedicated Player</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="game-actions slide-in-right">
        <button 
          onClick={createRoom} 
          className="create-room-btn"
          disabled={connectionStatus !== 'connected'}
        >
          🚀 Create New Battle
          {connectionStatus !== 'connected' && ' (Connecting...)'}
        </button>
        
        <div className="join-room-section">
          <h3>Join a Battle</h3>
          <input
            type="text"
            placeholder="ROOM CODE"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <button 
            onClick={joinRoom} 
            className="join-room-btn"
            disabled={connectionStatus !== 'connected'}
          >
            🎯 Join Battle
            {connectionStatus !== 'connected' && ' (Connecting...)'}
          </button>
        </div>
        
        {/* DuoLingo-style Daily Challenge */}
        <div className="daily-challenge">
          <h3>📅 Daily Challenge</h3>
          <p>Win 3 games today to earn bonus XP!</p>
          <div className="challenge-progress">
            <div className="challenge-bar">
              <div 
                className="challenge-fill" 
                style={{ width: `${Math.min(((userData?.games_won || 0) % 3) / 3 * 100, 100)}%` }}
              ></div>
            </div>
            <span className="challenge-text">
              {Math.min((userData?.games_won || 0) % 3, 3)}/3 wins today
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLobby = () => (
    <div className="lobby">
      <h2>🏠 Room: {room?.code}</h2>
      
      <div className="players-list bounce-in">
        <h3>Players ({room?.players?.length || 0}/{room?.maxPlayers || 5})</h3>
        {room?.players?.map((player, index) => (
          <div key={player.id} className={`player ${player.isHost ? 'host' : ''}`} style={{animationDelay: `${index * 0.1}s`}}>
            <div className="player-info">
              <span className="player-name">👤 {player.username}</span>
              <span className="player-stats">⭐ {player.xp || 0} XP</span>
            </div>
            {player.isHost && <span className="host-badge">👑 Host</span>}
          </div>
        ))}
      </div>
      
      <div className="lobby-actions">
        {room?.hostId === socketRef.current?.id ? (
          <button 
            onClick={startGame} 
            disabled={!room?.players || room.players.length < 2}
            className="start-game-btn"
          >
            {(!room?.players || room.players.length < 2) ? 
              '⏳ Need 2+ Players' : 
              '🚀 Start the Battle!'
            }
          </button>
        ) : (
          <div className="waiting-message">
            <h3>⏳ Waiting for host to start...</h3>
            <div className="loading-dots">
              <span>.</span><span>.</span><span>.</span>
            </div>
          </div>
        )}
        
        <button onClick={leaveRoom} className="leave-room-btn">
          ❌ Leave Room
        </button>
      </div>
    </div>
  );

  const renderGame = () => {
    if (!currentQuestion) {
      return (
        <div className="game-container">
          <div className="game-loading bounce-in">
            <h2>⚡ Get Ready!</h2>
            <p>Next question coming up...</p>
            <div className="loading-animation">🧠</div>
          </div>
        </div>
      );
    }

    if (!currentQuestion.question || !currentQuestion.options) {
      return (
        <div className="game-container">
          <div className="game-loading">
            <h2>🔄 Loading Question...</h2>
            <p>Please wait...</p>
          </div>
        </div>
      );
    }

    const progressPercentage = ((currentQuestion.questionNumber || 1) / (currentQuestion.totalQuestions || 15)) * 100;

    return (
      <div className="game-container">
        <div className="floating-xp">⏱️ {timeRemaining}s</div>
        
        <div className="game-header">
          <div className="question-progress">
            Question {currentQuestion.questionNumber || 1} of {currentQuestion.totalQuestions || 15}
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          <div className={`timer ${timeRemaining <= 10 ? 'timer-urgent' : ''}`}>
            {timeRemaining}s
          </div>
        </div>
        
        <div className="question-content slide-in-left">
          <div className="category-badge">{currentQuestion.category || 'General'}</div>
          <h2 className="question-text">{currentQuestion.question}</h2>
        </div>
        
        <div className="answers-grid">
          {currentQuestion.options && Object.entries(currentQuestion.options).map(([key, option], index) => (
            <button
              key={key}
              onClick={() => submitAnswer(key)}
              disabled={hasAnswered}
              className={`answer-btn ${selectedAnswer === key ? 'selected' : ''} ${hasAnswered ? 'disabled' : ''} slide-in-right`}
              style={{animationDelay: `${index * 0.1}s`}}
            >
              <span className="option-letter">{key.toUpperCase()}</span>
              <span className="option-text">{option}</span>
            </button>
          ))}
        </div>
        
        {hasAnswered && (
          <div className="answer-submitted bounce-in">
            <p>✅ Answer submitted! Waiting for other players...</p>
            <div className="waiting-animation">🤔💭</div>
          </div>
        )}
      </div>
    );
  };

  const renderQuestionResults = () => {
    if (!questionResults) return null;

    const userResult = questionResults.results?.find(r => r.username === userData?.username);
    const correctOption = questionResults.correctAnswer;

    if (!correctOption || typeof correctOption !== 'string') {
      return (
        <div className="question-results">
          <div className="loading-message bounce-in">
            <p>🔄 Loading results...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="question-results">
        <div className="results-header">
          <h2>📊 Question Results</h2>
        </div>
        
        <div className="correct-answer-section bounce-in">
          <h3>✅ Correct Answer:</h3>
          <div className="correct-answer-display">
            <span className="option-letter">{correctOption.toUpperCase()}</span>
            <span className="option-text">{questionResults.options?.[correctOption] || 'Unknown'}</span>
          </div>
        </div>

        {userResult && (
          <div className={`user-result ${userResult.isCorrect ? 'correct' : 'wrong'} slide-in-left`}>
            <h4>{userResult.isCorrect ? '🎉 Your Answer:' : '❌ Your Answer:'}</h4>
            <p>
              {userResult.selectedOption ? 
                `${userResult.selectedOption.toUpperCase()}. ${questionResults.options?.[userResult.selectedOption] || 'Unknown'}` : 
                'No answer submitted'
              }
            </p>
            <p className="score-earned">
              {userResult.isCorrect ? 
                `🌟 +${userResult.questionScore || 0} points!` : 
                '💔 No points earned'
              }
            </p>
          </div>
        )}

        <div className="educational-content slide-in-right">
          {userResult?.isCorrect ? (
            <div className="fun-fact">
              <h4>💡 Amazing Fact!</h4>
              <p>{questionResults.explanation || "You're doing great! Keep it up! 🌟"}</p>
            </div>
          ) : (
            <div className="snarky-comment">
              <h4>🤔 Learning Moment!</h4>
              <p>{questionResults.snark || "Don't worry, every expert was once a beginner! 💪"}</p>
            </div>
          )}
        </div>

        <div className="current-leaderboard bounce-in">
          <h4>🏆 Current Standings</h4>
          <div className="leaderboard-list">
            {questionResults.leaderboard?.map((player, index) => (
              <div key={player.username || index} className="leaderboard-item" style={{animationDelay: `${index * 0.1}s`}}>
                <span className="rank">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </span>
                <span className="username">{player.username || 'Unknown'}</span>
                <span className="score">{player.score || 0} pts</span>
              </div>
            )) || <p>No leaderboard data available</p>}
          </div>
        </div>
      </div>
    );
  };

  const renderGameResults = () => {
    if (!gameResults) return null;

    const userResult = gameResults.finalResults?.find(r => r.username === userData?.username);

    return (
      <div className="game-results">
        <div className="llama-mascot">🦙</div>
        
        <div className="results-header">
          <h1>🎉 Battle Complete!</h1>
          <p>Great job everyone! 🌟</p>
        </div>

        {userResult && (
          <div className="user-final-result">
            <h2>🎯 Your Battle Results</h2>
            <div className="placement-badge">
              <span className="placement">
                {userResult.placement === 1 ? '🥇' : 
                 userResult.placement === 2 ? '🥈' :
                 userResult.placement === 3 ? '🥉' : 
                 `#${userResult.placement}`}
              </span>
              <span className="placement-text">
                {userResult.placement === 1 ? 'Champion!' : 
                 userResult.placement === 2 ? 'Runner-up!' :
                 userResult.placement === 3 ? 'Third Place!' : 
                 `${userResult.placement}th Place`}
              </span>
            </div>
            
            <div className="result-stats">
              <div className="stat bounce-in" style={{animationDelay: '0.1s'}}>
                <span className="stat-label">Final Score</span>
                <span className="stat-value">{userResult.score} pts</span>
              </div>
              <div className="stat bounce-in" style={{animationDelay: '0.2s'}}>
                <span className="stat-label">Accuracy</span>
                <span className="stat-value">{userResult.correctAnswers}/{gameResults.totalQuestions}</span>
              </div>
              <div className="stat bounce-in" style={{animationDelay: '0.3s'}}>
                <span className="stat-label">XP Earned</span>
                <span className="stat-value">+{userResult.xpReward} XP</span>
              </div>
              <div className="stat bounce-in" style={{animationDelay: '0.4s'}}>
                <span className="stat-label">Gems Earned</span>
                <span className="stat-value">+{userResult.gemReward} 💎</span>
              </div>
            </div>
            
            {/* DuoLingo-style Motivational Message */}
            <div className="motivation-message">
              {userResult.placement === 1 ? (
                <p>🌟 Outstanding! You're a true Brain Brawl champion! 🌟</p>
              ) : userResult.placement <= 3 ? (
                <p>💪 Great job! You're getting stronger with every battle! 💪</p>
              ) : (
                <p>🚀 Keep practicing! Every question makes you smarter! 🚀</p>
              )}
            </div>
          </div>
        )}

        <div className="final-leaderboard slide-in-left">
          <h3>🏆 Final Rankings</h3>
          <div className="leaderboard-final">
            {gameResults.finalResults?.map((player, index) => (
              <div key={player.username} className="final-leaderboard-item bounce-in" style={{animationDelay: `${index * 0.1}s`}}>
                <div className="rank-section">
                  <span className="final-rank">
                    {player.placement === 1 ? '🥇' : 
                     player.placement === 2 ? '🥈' :
                     player.placement === 3 ? '🥉' : 
                     `#${player.placement}`}
                  </span>
                </div>
                <div className="player-section">
                  <span className="player-name">{player.username}</span>
                  <span className="final-score">{player.score} points</span>
                </div>
                <div className="rewards-section">
                  <span className="xp-reward">+{player.xpReward} XP</span>
                  <span className="gem-reward">+{player.gemReward} 💎</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="results-actions">
          <button onClick={backToDashboard} className="back-to-dashboard-btn">
            🏠 Back to Dashboard
          </button>
        </div>
      </div>
    );
  };

  // Main render with DuoLingo styling
  if (!isLoggedIn) {
    return renderAuth();
  }

  return (
    <div className={`app ${feedbackType ? `feedback-${feedbackType}` : ''}`}>
      {/* DuoLingo-style Feedback Overlay */}
      {showFeedback && (
        <div className="feedback-overlay">
          <div className={`feedback-message ${feedbackType}`}>
            {feedbackType === 'correct' ? (
              <>
                <div>✅ CORRECT!</div>
                <div style={{fontSize: '1.5rem', marginTop: '0.5rem'}}>🌟 Amazing! 🌟</div>
              </>
            ) : (
              <>
                <div>❌ WRONG!</div>
                <div style={{fontSize: '1.5rem', marginTop: '0.5rem'}}>💪 Keep trying! 💪</div>
              </>
            )}
          </div>
        </div>
      )}

      {gameState === 'dashboard' && renderDashboard()}
      {gameState === 'lobby' && renderLobby()}
      {gameState === 'game' && renderGame()}
      {gameState === 'question-results' && renderQuestionResults()}
      {gameState === 'results' && renderGameResults()}
    </div>
  );
}

export default App;