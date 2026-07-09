import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from 'axios'

export default function Register() {
  const [form, setForm] = useState({
    name: '', email: '', password: '', department: '',
    role: 'teacher', secretKey: '',
    facultyCode: '',
  })
  const [departments, setDepartments] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    axios.get('/api/auth/departments')
      .then(r => setDepartments(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDepartments([
        'Computer Science & Engineering',
        'Information Science & Engineering',
        'Electronics & Communication Engineering',
        'Mechanical Engineering',
        'Civil Engineering',
      ]))
  }, [])

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const payload = {
        ...form,
        facultyCode: form.facultyCode ? form.facultyCode.trim().toUpperCase() : '',
      }
      // Admin doesn't need department / facultyCode
      if (form.role === 'admin') {
        payload.department = ''
        payload.facultyCode = ''
      }
      await axios.post('/api/auth/register', payload)
      setSuccess('Registered successfully! Redirecting...')
      setTimeout(() => navigate('/login'), 1500)
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const isAdmin = form.role === 'admin'
  const needsFacultyCode = form.role === 'teacher' || form.role === 'hod'

  return (
    <div className="campus-bg">
      <div className="page-center">
        <div className="glass form-card">
          <div className="brand">
            <div className="logo-ring">🎓</div>
            <h1>EduDashboard</h1>
            <p>Create your account</p>
          </div>

          {error && <div className="error-msg">{error}</div>}
          {success && <div className="success-msg">{success}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Full Name</label>
              <div className="input-wrap">
                <span className="input-icon">👤</span>
                <input type="text" name="name" placeholder="Your full name" value={form.name} onChange={handleChange} required />
              </div>
            </div>
            <div className="form-group">
              <label>Email</label>
              <div className="input-wrap">
                <span className="input-icon">✉️</span>
                <input type="email" name="email" placeholder="Your email address" value={form.email} onChange={handleChange} required />
              </div>
            </div>
            <div className="form-group">
              <label>Password</label>
              <div className="input-wrap">
                <span className="input-icon">🔒</span>
                <input type="password" name="password" placeholder="Choose a password" value={form.password} onChange={handleChange} required />
              </div>
            </div>

            {!isAdmin && (
              <div className="form-group">
                <label>Department</label>
                <div className="input-wrap">
                  <span className="input-icon">🏛️</span>
                  <select
                    name="department"
                    value={form.department}
                    onChange={handleChange}
                    required={!isAdmin}
                    style={{
                      width: '100%',
                      paddingLeft: '2.5rem',
                      height: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: 'inherit',
                      font: 'inherit',
                      appearance: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="" disabled style={{ color: '#333' }}>Select your department</option>
                    {departments.map(d => (
                      <option key={d} value={d} style={{ color: '#333' }}>{d}</option>
                    ))}
                  </select>
                </div>
                {form.role === 'hod' && (
                  <div style={{
                    fontSize: '0.72rem',
                    color: 'rgba(255,255,255,0.45)',
                    marginTop: '0.3rem',
                    paddingLeft: '0.2rem',
                  }}>
                    Only one HOD is allowed per department.
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label>Role</label>
              <select name="role" value={form.role} onChange={handleChange} className="no-icon" style={{ paddingLeft: '1rem' }}>
                <option value="teacher">Teacher</option>
                <option value="hod">HOD</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {needsFacultyCode && (
              <div className="form-group">
                <label>Faculty Code</label>
                <div className="input-wrap">
                  <span className="input-icon">🆔</span>
                  <input
                    type="text"
                    name="facultyCode"
                    placeholder="e.g. SM, UT, JGR (from your timetable)"
                    value={form.facultyCode}
                    onChange={handleChange}
                    required
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div style={{
                  fontSize: '0.72rem',
                  color: 'rgba(255,255,255,0.45)',
                  marginTop: '0.3rem',
                  paddingLeft: '0.2rem',
                }}>
                  {form.role === 'hod'
                    ? 'HODs also teach some classes, so a valid faculty code is required.'
                    : 'Use the code that appears next to your name in the official department timetable.'}
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Secret Key</label>
              <div className="input-wrap">
                <span className="input-icon">🗝️</span>
                <input type="password" name="secretKey" placeholder="Enter role secret key" value={form.secretKey} onChange={handleChange} required />
              </div>
              <div style={{
                fontSize: '0.72rem',
                color: 'rgba(255,255,255,0.45)',
                marginTop: '0.3rem',
                paddingLeft: '0.2rem',
              }}>
                {form.role === 'teacher' && 'Codes are provided to you at induction.'}
                {form.role === 'hod' && 'Codes are issued by the institution to designated HODs.'}
                {form.role === 'admin' && 'Admin code is issued by the system administrator.'}
              </div>
            </div>

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Registering...' : 'Register'}
            </button>
          </form>

          <div className="form-footer">
            Already have an account? <Link to="/login">Sign In</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
