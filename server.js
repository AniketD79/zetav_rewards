const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const managerRoutes = require('./routes/manager');
const employeeRoutes = require('./routes/employee');
const postsRoutes = require('./routes/posts');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRewardsRouter = require('./routes/adminRewards');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/post_images', express.static(path.join(__dirname, 'post_images')));
app.use('/reward_category', express.static(path.join(__dirname, 'reward_category')));


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/adminrewards', adminRewardsRouter);

app.get('/', (req, res) => {
  res.send("Zeta-Reward App API");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
