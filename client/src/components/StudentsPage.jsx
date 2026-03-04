import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStudents, getTimeSlots, deleteStudent, updateStudent, deleteAllStudents, previewStudentsFromNotion, importStudentsFromNotion } from '../services/api';
import StudentFormModal from './StudentFormModal';
import NotionImportModal from './NotionImportModal';

function StudentsPage({ selectedDate }) {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch students for the selected date
  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ['students', selectedDate],
    queryFn: async () => {
      const response = await getStudents(selectedDate);
      return response.data;
    },
    enabled: !!selectedDate,
  });

  // Fetch time slots for display
  const { data: timeSlots } = useQuery({
    queryKey: ['timeSlots'],
    queryFn: async () => {
      const response = await getTimeSlots();
      return response.data;
    },
  });

  // Update availability mutation
  const updateAvailabilityMutation = useMutation({
    mutationFn: ({ id, data }) => updateStudent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['students']);
    },
    onError: (error) => {
      console.error('Update error:', error);
      alert('Failed to update student availability');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteStudent,
    onSuccess: () => {
      queryClient.invalidateQueries(['students']);
    },
  });


  // Delete all mutation
  const deleteAllMutation = useMutation({
    mutationFn: (date) => deleteAllStudents(date),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['students']);
      alert(response.data.message || 'Students deleted successfully!');
    },
    onError: (error) => {
      console.error('Delete all error:', error);
      alert('Failed to delete all students: ' + (error.response?.data?.message || error.message));
    },
  });

  const handleAdd = () => {
    setEditingStudent(null);
    setIsModalOpen(true);
  };

  const handleEdit = (student) => {
    setEditingStudent(student);
    setIsModalOpen(true);
  };

  const handleDelete = async (student) => {
    if (confirm(`Are you sure you want to delete ${student.name}?`)) {
      try {
        await deleteMutation.mutateAsync(student.id);
      } catch (error) {
        alert('Failed to delete student');
      }
    }
  };

  const handleDeleteAll = async () => {
    const studentCount = students?.length || 0;

    if (studentCount === 0) {
      alert('No students to delete');
      return;
    }

    const confirmed = confirm(
      `⚠️ WARNING: Delete ALL ${studentCount} student(s) for ${selectedDate}?\n\nThis will remove all students for this date only.\n\nA backup will be created automatically before deletion.`
    );

    if (confirmed) {
      try {
        await deleteAllMutation.mutateAsync(selectedDate);
      } catch (error) {
        console.error('Failed to delete all students:', error);
      }
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingStudent(null);
  };

  const handleSave = () => {
    queryClient.invalidateQueries(['students']);
    handleModalClose();
  };

  // Toggle availability for a specific time slot
  const handleToggleAvailability = async (student, timeSlotId) => {
    const currentAvailability = student.availability || [];
    const newAvailability = currentAvailability.includes(timeSlotId)
      ? currentAvailability.filter(id => id !== timeSlotId)
      : [...currentAvailability, timeSlotId].sort();

    try {
      await updateAvailabilityMutation.mutateAsync({
        id: student.id,
        data: {
          name: student.name,
          english_name: student.english_name,
          availability: newAvailability,
          color_keyword: student.color_keyword,
          weakness_level: student.weakness_level,
          teacher_notes: student.teacher_notes,
        },
      });
    } catch (error) {
      console.error('Failed to toggle availability:', error);
    }
  };

  // Filter students by search term
  const filteredStudents = students?.filter((student) =>
    student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.english_name?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (studentsLoading) {
    return <div className="text-center py-8">Loading students...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Students Management</h2>
          <div className="flex gap-3">
            <button
              onClick={() => setIsImportModalOpen(true)}
              disabled={!selectedDate}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md hover:shadow-lg transition-all"
            >
              Import from Notion
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={deleteAllMutation.isPending || !students || students.length === 0}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md hover:shadow-lg transition-all"
            >
              Delete All Students
            </button>
            <button
              onClick={handleAdd}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-md hover:shadow-lg transition-all"
            >
              + Add Student
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search students..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-5 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
          />
        </div>

        {/* Students Grid */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 border-b-2 border-gray-300">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r-2 border-gray-300 sticky left-0 bg-gray-50 z-10">
                  Student Name
                </th>
                {timeSlots?.map((slot, index) => {
                  // Determine background color based on position
                  const bgColor = Math.floor(index / 2) % 2 === 0 ? 'bg-blue-50' : 'bg-gray-50';

                  return (
                    <th key={slot.id} className={`px-2 py-3 text-center text-xs font-semibold text-gray-900 border-r border-gray-200 min-w-[80px] ${bgColor}`}>
                      {slot.name.replace(' to ', '-')}
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 sticky right-0 bg-gray-50 z-10">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={timeSlots?.length + 2 || 3} className="px-4 py-8 text-center text-gray-500">
                    No students found
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  // Get color for this student
                  const getStudentColor = () => {
                    if (!student.color_keyword) return '#3b82f6'; // default blue
                    const colorMap = {
                      red: '#ef4444',
                      blue: '#3b82f6',
                      green: '#10b981',
                      yellow: '#eab308',
                      purple: '#a855f7',
                      orange: '#f97316',
                      pink: '#ec4899',
                    };
                    return colorMap[student.color_keyword] || '#3b82f6';
                  };

                  return (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td
                        className="px-4 py-3 text-sm font-medium text-gray-900 border-r-2 border-gray-300 sticky left-0 bg-white hover:bg-blue-100 z-10 cursor-pointer"
                        onClick={() => handleEdit(student)}
                        title="Click to edit student"
                      >
                        {student.name}
                      </td>
                      {timeSlots?.map((slot, index) => {
                        const isAvailable = student.availability?.includes(slot.id);

                        // Determine background color based on position
                        const bgColor = Math.floor(index / 2) % 2 === 0 ? '#eff6ff' : '#f3f4f6'; // blue-50 or gray-50

                        return (
                          <td
                            key={slot.id}
                            className="px-2 py-1 text-center border border-gray-300 cursor-pointer"
                            style={{
                              backgroundColor: isAvailable ? getStudentColor() : bgColor,
                            }}
                            onClick={() => handleToggleAvailability(student, slot.id)}
                            title={isAvailable ? 'Available - Click to remove' : 'Not available - Click to add'}
                          >
                            {isAvailable && (
                              <div style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff' }}>✓</div>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center sticky right-0 bg-white hover:bg-gray-50 z-10">
                        <button
                          onClick={() => handleDelete(student)}
                          disabled={deleteMutation.isPending}
                          className="px-3 py-1 text-sm text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          Total: {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
        </div>
      </div>

      {isModalOpen && (
        <StudentFormModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onSave={handleSave}
          student={editingStudent}
          timeSlots={timeSlots || []}
          selectedDate={selectedDate}
        />
      )}

      <NotionImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        selectedDate={selectedDate}
        type="students"
        previewFn={previewStudentsFromNotion}
        importFn={importStudentsFromNotion}
      />
    </div>
  );
}

export default StudentsPage;
