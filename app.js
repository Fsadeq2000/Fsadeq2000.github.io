const loginContainer = document.getElementById('login-container');
const profileContainer = document.getElementById('profile-container');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const successMessage = document.getElementById('success-message');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');
const userAvatar = document.getElementById('user-avatar');
const joinDate = document.getElementById('join-date');
const totalXp = document.getElementById('total-xp');
const auditRatio = document.getElementById('audit-ratio');
const userLevel = document.getElementById('user-level');
const xpGraph = document.getElementById('xp-graph');
const skillsContainer = document.getElementById('skills-container');
const projectsList = document.getElementById('projects-list');

const API_DOMAIN = 'https://learn.reboot01.com';
const SIGNIN_URL = `${API_DOMAIN}/api/auth/signin`;
const GRAPHQL_URL = `${API_DOMAIN}/api/graphql-engine/v1/graphql`;

document.addEventListener('DOMContentLoaded', async () => {
  await loadD3();
  
  const token = localStorage.getItem('jwt_token');
  if (token) {
    try {
      const userData = parseJwt(token);
      showProfileView();
      fetchProfileData(token);
    } catch (e) {
      console.error('Invalid token:', e);
      logout();
    }
  }
});

loginBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    showError('Please enter both username and password');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="loading"></span> Authenticating...';

  try {
    const token = await authenticate(username, password);
    localStorage.setItem('jwt_token', token);
    
    showSuccess();
    
    setTimeout(() => {
      showProfileView();
      fetchProfileData(token);
    }, 1500);
    
  } catch (error) {
    showError(error.message);
    resetLoginButton();
  }
});

logoutBtn.addEventListener('click', logout);

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const decoded = JSON.parse(jsonPayload);
    
    decoded.userId = decoded.userId || decoded.id || decoded.sub;
    
    if (!decoded.userId) {
      throw new Error('No user ID found in token');
    }
    
    return decoded;
  } catch (e) {
    throw new Error('Invalid token: ' + e.message);
  }
}

async function authenticate(username, password) {
  const credentials = btoa(`${username}:${password}`);
  
  const response = await fetch(SIGNIN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Login failed. Please check your credentials.');
  }

  const data = await response.json();
  return data;
}

async function fetchProfileData(token) {
  try {
    const userData = parseJwt(token);
    const userId = userData.userId || userData.id;
    if (!userId) {
      throw new Error('Unable to determine user ID from token');
    }

    const eventsQuery = `
      {
        events: progress(
          order_by: [{objectId: asc}, {createdAt: desc}]
          distinct_on: [objectId]
          where: {object: {name: {_in: ["Piscine JS", "Piscine Go", "Module"]}}}
        ) {
          id
          grade
          isDone
          createdAt
          updatedAt
          eventId
          object {
            name
          }
        }
      }
    `;

    const eventsResponse = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query: eventsQuery })
    });

    let eventId = null;
    let events = [];
    
    if (eventsResponse.ok) {
      const { data } = await eventsResponse.json();
      events = data.events.map(e => ({
        id: e.eventId,
        type: e.object.name
      }));

      const moduleEvent = events.find(e => e.type === "Module");
      eventId = moduleEvent?.id || events[0]?.id;
    }

    if (!eventId) {
      throw new Error('Could not determine event ID');
    }

    const query = `
      {
        user {
          id
          auditRatio
          campus
          createdAt
          email
          firstName
          lastName
          login
          totalUp
          totalDown
          labels {
            labelName
          }
        }
        xp: transaction_aggregate(where: {type: {_eq: "xp"}, eventId: {_eq: ${eventId}}}) {
          aggregate {
            sum {
              amount
            }
          }
        }
        progress: transaction(
          where: {type: {_eq: "xp"}, eventId: {_eq: ${eventId}}}
          order_by: {createdAt: asc}
        ) {
          amount
          createdAt
          object {
            name
            type
            createdAt
          }
          type
        }
        level: transaction(
          limit: 1
          order_by: {amount: desc}
          where: {type: {_eq: "level"}, eventId: {_eq: ${eventId}}}
        ) {
          amount
        }
        skills: transaction(
          where: {type: {_like: "skill_%"}}
          distinct_on: [type]
        ) {
          type
        }
        projects: transaction(
          where: {
            type: {_eq: "xp"},
            eventId: {_eq: ${eventId}}
          },
          order_by: {createdAt: asc}
        ) {
          amount
          createdAt
          object {
            name
            attrs
          }
        }
        group(
          where: {members: {userId: {_eq: ${userId}}}, _or: [{eventId: {_eq: 20}}, {event: {parentId: {_eq: 20}}}]}
        ) {
          id
          status
          captainLogin
          captainId
          object {
            name
          }
          members {
            id
            userId
            userLogin
            userAuditRatio
            accepted
            user {
              firstName
              lastName
            }
          }
          updatedAt
        }
      }
    `;

    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(result.errors.map(e => e.message).join(', '));
    }

    if (!result.data || !result.data.user || result.data.user.length === 0) {
      throw new Error('No user data found');
    }

    displayProfileData({ ...result.data, events });
    
  } catch (error) {
    console.error('Error fetching profile data:', error);
    projectsList.innerHTML = `<p class="error">Error loading profile data: ${error.message}</p>`;
  }
}

function displayProfileData(data) {
  const user = data.user && data.user[0] ? data.user[0] : {
    firstName: "N/A",
    lastName: "N/A",
    login: "N/A",
    id: "N/A",
    campus: "N/A",
    createdAt: "N/A",
    labels: []
  };

  const level = data.level && data.level[0] ? Math.round(data.level[0].amount) : 0;
  
  const xp = data.xp?.aggregate?.sum?.amount || 0;
  const totalKB = Math.round(xp / 1000);

  const skills = data.skills || [];
  const projects = data.projects || [];
  const events = data.events || [];

  userName.textContent = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.login;
  userAvatar.textContent = user.login ? user.login.charAt(0).toUpperCase() : 'U';
  
  const joinDateObj = new Date(user.createdAt);
  joinDate.textContent = joinDateObj.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  totalXp.textContent = totalKB.toLocaleString(); 
  

  const roundedRatio = user.auditRatio ? Math.round(user.auditRatio * 10) / 10 : null;
  auditRatio.textContent = roundedRatio !== null ? roundedRatio : 'N/A';
  
  userLevel.textContent = level;
  
  renderSkills(skills);
  renderProjects(projects); 
  renderXpChart(data.progress || []);
}


function renderSkills(skills) {
  skillsContainer.innerHTML = '';
  
  if (skills.length === 0) {
    skillsContainer.innerHTML = '<p>No skills found</p>';
    return;
  }
  
  skills.forEach(skill => {
    const skillName = skill.type.replace('skill_', '');
    const skillElement = document.createElement('div');
    skillElement.className = 'badge';
    skillElement.style.backgroundColor = '#e0e0e0';
    skillElement.textContent = skillName;
    skillsContainer.appendChild(skillElement);
  });
}


function renderProjects(projects) {
  projectsList.innerHTML = '';
  
  if (projects.length === 0) {
    projectsList.innerHTML = '<p>No projects found</p>';
    return;
  }
  
  projects.forEach(project => {
   
    const kbValue = (project.amount / 1000).toFixed(2);
    
    const projectElement = document.createElement('div');
    projectElement.style.padding = '10px';
    projectElement.style.borderBottom = '1px solid #eee';
    
    projectElement.innerHTML = `
      <h3 style="margin-bottom: 5px;">${project.object?.name || 'Unknown Project'}</h3>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-light);">${new Date(project.createdAt).toLocaleDateString()}</span>
        <span style="font-weight: bold;">${kbValue} KB</span>
      </div>
    `;
    
    projectsList.appendChild(projectElement);
  });
}


function renderXpChart(transactions) {
  const xpByDate = {};
  let cumulativeXP = 0;
  
  transactions.forEach(tx => {
    const date = new Date(tx.createdAt).toLocaleDateString();
    cumulativeXP += tx.amount;
    xpByDate[date] = cumulativeXP;
  });
  
  const dates = Object.keys(xpByDate);
  const xpValues = Object.values(xpByDate);
  
  const svg = createSVG(xpGraph);
  const margin = { top: 20, right: 30, bottom: 40, left: 50 };
  const width = xpGraph.clientWidth - margin.left - margin.right;
  const height = xpGraph.clientHeight - margin.top - margin.bottom;
  
  const x = d3.scaleBand()
    .domain(dates)
    .range([0, width])
    .padding(0.1);
  
  const y = d3.scaleLinear()
    .domain([0, d3.max(xpValues)])
    .range([height, 0]);
  
  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).tickValues(dates.filter((d, i) => i % Math.ceil(dates.length / 5) === 0)));
  
  svg.append('g')
    .call(d3.axisLeft(y));
  
  const line = d3.line()
    .x(d => x(d.date) + x.bandwidth() / 2)
    .y(d => y(d.value));
  
  const dataPoints = dates.map((date, i) => ({ date, value: xpValues[i] }));
  
  svg.append('path')
    .datum(dataPoints)
    .attr('fill', 'none')
    .attr('stroke', 'steelblue')
    .attr('stroke-width', 2)
    .attr('d', line);
  
  svg.selectAll('.dot')
    .data(dataPoints.filter((d, i) => i % Math.ceil(dataPoints.length / 10) === 0))
    .enter().append('circle')
    .attr('class', 'dot')
    .attr('cx', d => x(d.date) + x.bandwidth() / 2)
    .attr('cy', d => y(d.value))
    .attr('r', 4)
    .attr('fill', 'steelblue');
  
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', height + margin.top + 20)
    .attr('text-anchor', 'middle')
    .text('Date');
  
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -margin.left + 10)
    .attr('x', -height / 2)
    .attr('text-anchor', 'middle')
    .text('Cumulative XP');
}


function createSVG(container) {
  container.innerHTML = '';
  return d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${container.clientWidth} ${container.clientHeight}`)
    .append('g');
}


function showProfileView() {
  loginContainer.classList.add('hidden');
  successMessage.classList.add('hidden');
  profileContainer.classList.remove('hidden');
  resetLoginButton();
}


function showLoginView() {
  loginContainer.classList.remove('hidden');
  profileContainer.classList.add('hidden');
  successMessage.classList.add('hidden');
  errorMessage.classList.add('hidden');
  usernameInput.value = '';
  passwordInput.value = '';
  resetLoginButton();
}


function showError(message) {
  errorText.textContent = message;
  errorMessage.classList.remove('hidden');
  successMessage.classList.add('hidden');
}


function showSuccess() {
  errorMessage.classList.add('hidden');
  successMessage.classList.remove('hidden');
}


function resetLoginButton() {
  loginBtn.disabled = false;
  loginBtn.textContent = 'Sign In';
}


function logout() {
  localStorage.removeItem('jwt_token');
  showLoginView();
}


function loadD3() {
  return new Promise((resolve, reject) => {
    if (window.d3) return resolve();
    
    const script = document.createElement('script');
    script.src = 'https://d3js.org/d3.v7.min.js';
    script.onload = () => {
      if (!window.d3) {
        reject(new Error('D3.js failed to load'));
      }
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load D3.js'));
    document.head.appendChild(script);
  });
}
