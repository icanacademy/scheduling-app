import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import Dashboard from './components/Dashboard';
import TeachersPage from './components/TeachersPage';
import StudentsPage from './components/StudentsPage';
import HiringPage from './components/HiringPage';
import PrintView from './components/PrintView';
import StudentPrintPage from './components/StudentPrintPage';
import BackupRestorePage from './components/BackupRestorePage';
import Calendar from './components/Calendar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000, // 30 seconds
    },
  },
});

function App() {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [activeTab, setActiveTab] = useState('schedule');

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-md">
          <div className="max-w-full mx-auto px-8 py-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <img
                  src="/assets/ican-logo.png"
                  alt="ICAN Logo"
                  className="h-12 w-auto bg-gradient-to-br from-blue-500 to-blue-700 p-2 rounded-lg shadow-md"
                />
                <h1 className="text-4xl font-bold text-blue-600 tracking-wide">
                  Scheduler
                </h1>
              </div>
              <div className="flex items-center gap-4">
                <label className="text-sm font-semibold text-gray-700">
                  Date:
                </label>
                <Calendar selectedDate={selectedDate} onDateChange={setSelectedDate} />
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 border-b-2 border-gray-200">
              <button
                onClick={() => setActiveTab('schedule')}
                className={`px-6 py-3 font-semibold text-base border-b-3 transition-all ${
                  activeTab === 'schedule'
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Schedule
              </button>
              <button
                onClick={() => setActiveTab('teachers')}
                className={`px-6 py-3 font-semibold text-base border-b-3 transition-all ${
                  activeTab === 'teachers'
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Teachers
              </button>
              <button
                onClick={() => setActiveTab('students')}
                className={`px-6 py-3 font-semibold text-base border-b-3 transition-all ${
                  activeTab === 'students'
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Students
              </button>
              <button
                onClick={() => setActiveTab('hiring')}
                className={`px-6 py-3 font-semibold text-base border-b-3 transition-all ${
                  activeTab === 'hiring'
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Hiring
              </button>
              <button
                onClick={() => setActiveTab('print')}
                className={`px-6 py-3 font-semibold text-base border-b-3 transition-all ${
                  activeTab === 'print'
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Print
              </button>
              <button
                onClick={() => setActiveTab('student-report')}
                className={`px-6 py-3 font-semibold text-base border-b-3 transition-all ${
                  activeTab === 'student-report'
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Student Schedule Sheet
              </button>
              <button
                onClick={() => setActiveTab('backups')}
                className={`px-6 py-3 font-semibold text-base border-b-3 transition-all ${
                  activeTab === 'backups'
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Backups
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-full mx-auto p-8">
          {activeTab === 'schedule' && <Dashboard selectedDate={selectedDate} />}
          {activeTab === 'teachers' && <TeachersPage selectedDate={selectedDate} />}
          {activeTab === 'students' && <StudentsPage selectedDate={selectedDate} />}
          {activeTab === 'hiring' && <HiringPage selectedDate={selectedDate} />}
          {activeTab === 'print' && <PrintView selectedDate={selectedDate} />}
          {activeTab === 'student-report' && <StudentPrintPage selectedDate={selectedDate} />}
          {activeTab === 'backups' && <BackupRestorePage />}
        </main>
      </div>
    </QueryClientProvider>
  );
}

export default App;
