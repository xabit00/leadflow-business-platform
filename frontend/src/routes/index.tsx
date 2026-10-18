import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { RootLayout } from '../layouts/RootLayout';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { SignupPage } from '../pages/auth/SignupPage';
import { ContactsPage } from '../pages/crm/ContactsPage';
import { CompaniesPage } from '../pages/crm/CompaniesPage';
import { OpportunitiesPage } from '../pages/crm/OpportunitiesPage';

export const AppRoutes = () => (
  <Routes>
    <Route path='/login' element={<LoginPage />} />
    <Route path='/signup' element={<SignupPage />} />
    <Route element={<ProtectedRoute />}>
      <Route path='/' element={<RootLayout />}>
        <Route index element={<HomePage />} />
        {/* CRM — Step 2 live */}
        <Route path='contacts' element={<ContactsPage />} />
        <Route path='companies' element={<CompaniesPage />} />
        <Route path='opportunities' element={<OpportunitiesPage />} />
        <Route path='*' element={<NotFoundPage />} />
      </Route>
    </Route>
  </Routes>
);
