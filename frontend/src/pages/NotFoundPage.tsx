import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
      <AlertCircle className="w-12 h-12 text-blue-500 mb-4" />
      <h1 className="text-2xl font-bold text-white mb-2">Page Not Found</h1>
      <p className="text-slate-400 text-sm max-w-md mb-6">
        This page is unavailable. Return to your overview or choose a screen from the navigation.
      </p>
      <Link to="/" className="primary-link">
          <Home className="w-4 h-4 mr-2" />
          Back to overview
      </Link>
    </div>
  );
};
