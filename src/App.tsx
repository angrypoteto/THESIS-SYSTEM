import { Duplicates } from './pages/admin/Duplicates'
import { Models } from './pages/admin/Models'
import { Faqs } from './pages/admin/Faqs'
import { Emails } from './pages/admin/Emails'
import { CheckEmail, Welcome } from './pages/auth/AfterSignUp'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { AuthLayout } from './components/AuthLayout'
import { Layout } from './components/Layout'
import { RequireRole } from './components/RequireRole'
import { StaffLayout } from './components/StaffLayout'
import { AuditLog } from './pages/admin/AuditLog'
import { Criteria } from './pages/admin/Criteria'
import { ApplicationPage } from './pages/application/ApplicationPage'
import { ForgotPassword, ResetPassword } from './pages/auth/PasswordReset'
import { SignIn } from './pages/auth/SignIn'
import { SignUp } from './pages/auth/SignUp'
import { Dashboard } from './pages/Dashboard'
import { Landing } from './pages/Landing'
import { Profile } from './pages/Profile'
import { ApplicantFile } from './pages/staff/ApplicantFile'
import { NotFound } from './pages/NotFound'
import { EligibilityCheck } from './pages/EligibilityCheck'
import { Interviews } from './pages/staff/Interviews'
import { Reports } from './pages/staff/Reports'
import { Users } from './pages/admin/Users'
import { Applicants } from './pages/staff/Applicants'
import { DocumentCheck } from './pages/staff/DocumentCheck'
import { ExamResults } from './pages/staff/ExamResults'
import { Cycles } from './pages/admin/Cycles'
import { Ranking } from './pages/staff/Ranking'
import { StaffHome } from './pages/staff/StaffHome'

// Hash routing: GitHub Pages serves one static file, so routes live after "#/" (Build Plan 12.5).
export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          {/* public + applicant: top bar */}
          <Route element={<Layout />}>
            <Route index element={<Landing />} />
            <Route path="app" element={<RequireRole><Dashboard /></RequireRole>} />
            <Route path="app/application" element={<RequireRole roles={['applicant']}><ApplicationPage /></RequireRole>} />
            <Route path="profile" element={<RequireRole><Profile /></RequireRole>} />
            <Route path="welcome" element={<Welcome />} />
            <Route path="check" element={<EligibilityCheck />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          {/* sign in / sign up / password reset: stand-alone split-screen pages */}
          <Route element={<AuthLayout />}>
            <Route path="signin" element={<SignIn />} />
            <Route path="signup" element={<SignUp />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="check-email" element={<CheckEmail />} />
          </Route>

          {/* staff + admin: sidebar */}
          <Route element={<RequireRole roles={['evaluator', 'admin']}><StaffLayout /></RequireRole>}>
            <Route path="staff" element={<StaffHome />} />
            <Route path="staff/applicants" element={<Applicants />} />
            <Route path="staff/applicants/:id" element={<ApplicantFile />} />
            <Route path="staff/documents/:id" element={<DocumentCheck />} />
            <Route path="staff/ranking" element={<Ranking />} />
            <Route path="staff/exam" element={<ExamResults />} />
            <Route path="staff/interviews" element={<Interviews />} />
            <Route path="staff/reports" element={<Reports />} />
            <Route path="admin" element={<Navigate to="/admin/criteria" replace />} />
            <Route path="admin/criteria" element={<RequireRole roles={['admin']}><Criteria /></RequireRole>} />
            <Route path="admin/audit" element={<RequireRole roles={['admin']}><AuditLog /></RequireRole>} />
            <Route path="admin/cycles" element={<RequireRole roles={['admin']}><Cycles /></RequireRole>} />
            <Route path="admin/users" element={<RequireRole roles={['admin']}><Users /></RequireRole>} />
            <Route path="admin/duplicates" element={<RequireRole roles={['admin']}><Duplicates /></RequireRole>} />
            <Route path="admin/models" element={<RequireRole roles={['admin']}><Models /></RequireRole>} />
            <Route path="admin/faqs" element={<RequireRole roles={['admin']}><Faqs /></RequireRole>} />
            <Route path="admin/emails" element={<RequireRole roles={['admin']}><Emails /></RequireRole>} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
