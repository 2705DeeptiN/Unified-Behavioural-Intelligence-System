import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from 'axios'

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await axios.post('/api/auth/login', form)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('role', res.data.role)
      localStorage.setItem('name', res.data.name)
      // NEW: persist faculty code so the dashboard knows who this is
      // in terms of the official timetable.
      if (res.data.facultyCode) {
        localStorage.setItem('facultyCode', res.data.facultyCode)
      } else {
        localStorage.removeItem('facultyCode')
      }
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="campus-bg">
      <div className="page-center">
        <div className="glass form-card">
          <div className="brand">
            <div className="logo-ring">🎓</div>
            <h1>EduDashboard</h1>
            <div className="sub-welc">Welcome Back!</div>
            <p>Login to your account</p>
          </div>

          {error && <div className="error-msg">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <div className="input-wrap">
                <span className="input-icon">✉️</span>
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <div className="input-wrap">
                <span className="input-icon">🔒</span>
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
            <div className="forgot">
              <a href="#">Forgot Password?</a>
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Login'}
            </button>
          </form>

          <div className="form-footer" style={{ marginTop: '1.4rem' }}>
            New to EduDashboard? <Link to="/register">Register here</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
