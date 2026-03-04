import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTeachers, getTimeSlots, deleteTeacher, updateTeacher, deleteAllTeachers, previewTeachersFromNotion, importTeachersFromNotion } from '../services/api';
import TeacherFormModal from './TeacherFormModal';
import NotionImportModal from './NotionImportModal';

function TeachersPage({ selectedDate }) {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch teachers for the selected date
  const { data: teachers, isLoading: teachersLoading } = useQuery({
    queryKey: ['teachers', selectedDate],
    queryFn: async () => {
      const response = await getTeachers(selectedDate);
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
    mutationFn: ({ id, data }) => updateTeacher(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['teachers']);
    },
    onError: (error) => {
      console.error('Update error:', error);
      alert('Failed to update teacher availability');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteTeacher,
    onSuccess: () => {
      queryClient.invalidateQueries(['teachers']);
    },
  });


  // Delete all mutation
  const deleteAllMutation = useMutation({
    mutationFn: (date) => deleteAllTeachers(date),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['teachers']);
      alert(response.data.message || 'Teachers deleted successfully!');
    },
    onError: (error) => {
      console.error('Delete all error:', error);
      alert('Failed to delete all teachers: ' + (error.response?.data?.message || error.message));
    },
  });

  const handleAdd = () => {
    setEditingTeacher(null);
    setIsModalOpen(true);
  };

  const handleEdit = (teacher) => {
    setEditingTeacher(teacher);
    setIsModalOpen(true);
  };

  const handleDelete = async (teacher) => {
    if (confirm(`Are you sure you want to delete ${teacher.name}?`)) {
      try {
        await deleteMutation.mutateAsync(teacher.id);
      } catch (error) {
        alert('Failed to delete teacher');
      }
    }
  };

  const handleDeleteAll = async () => {
    const teacherCount = teachers?.length || 0;

    if (teacherCount === 0) {
      alert('No teachers to delete');
      return;
    }

    const confirmed = confirm(
      `⚠️ WARNING: Delete ALL ${teacherCount} teacher(s) for ${selectedDate}?\n\nThis will remove all teachers for this date only.\n\nA backup will be created automatically before deletion.`
    );

    if (confirmed) {
      try {
        await deleteAllMutation.mutateAsync(selectedDate);
      } catch (error) {
        console.error('Failed to delete all teachers:', error);
      }
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingTeacher(null);
  };

  const handleSave = () => {
    queryClient.invalidateQueries(['teachers']);
    handleModalClose();
  };

  // Toggle availability for a specific time slot
  const handleToggleAvailability = async (teacher, timeSlotId) => {
    const currentAvailability = teacher.availability || [];
    const newAvailability = currentAvailability.includes(timeSlotId)
      ? currentAvailability.filter(id => id !== timeSlotId)
      : [...currentAvailability, timeSlotId].sort();

    try {
      await updateAvailabilityMutation.mutateAsync({
        id: teacher.id,
        data: {
          name: teacher.name,
          availability: newAvailability,
          color_keyword: teacher.color_keyword,
        },
      });
    } catch (error) {
      console.error('Failed to toggle availability:', error);
    }
  };

  // Filter teachers by search term
  const filteredTeachers = teachers?.filter((teacher) =>
    teacher.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Helper to get time slot names
  const getTimeSlotNames = (availability) => {
    if (!availability || !timeSlots) return '';
    return availability
      .map((id) => timeSlots.find((ts) => ts.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  if (teachersLoading) {
    return <div className="text-center py-8">Loading teachers...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Teachers Management</h2>
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
              disabled={deleteAllMutation.isPending || !teachers || teachers.length === 0}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md hover:shadow-lg transition-all"
            >
              Delete All Teachers
            </button>
            <button
              onClick={handleAdd}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-md hover:shadow-lg transition-all"
            >
              + Add Teacher
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search teachers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-5 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
          />
        </div>

        {/* Teachers Grid */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 border-b-2 border-gray-300">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r-2 border-gray-300 sticky left-0 bg-gray-50 z-10">
                  Teacher Name
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
              {filteredTeachers.length === 0 ? (
                <tr>
                  <td colSpan={timeSlots?.length + 2 || 3} className="px-4 py-8 text-center text-gray-500">
                    No teachers found
                  </td>
                </tr>
              ) : (
                filteredTeachers.map((teacher) => {
                  // Get color for this teacher
                  const getTeacherColor = () => {
                    if (!teacher.color_keyword) return '#10b981'; // default green
                    const colorMap = {
                      red: '#ef4444',
                      blue: '#3b82f6',
                      green: '#10b981',
                      yellow: '#eab308',
                      purple: '#a855f7',
                      orange: '#f97316',
                      pink: '#ec4899',
                    };
                    return colorMap[teacher.color_keyword] || '#10b981';
                  };

                  return (
                    <tr key={teacher.id} className="hover:bg-gray-50">
                      <td
                        className="px-4 py-3 text-sm font-medium text-gray-900 border-r-2 border-gray-300 sticky left-0 bg-white hover:bg-blue-100 z-10 cursor-pointer"
                        onClick={() => handleEdit(teacher)}
                        title="Click to edit teacher"
                      >
                        {teacher.name}
                      </td>
                      {timeSlots?.map((slot, index) => {
                        const isAvailable = teacher.availability?.includes(slot.id);

                        // Determine background color based on position
                        const bgColor = Math.floor(index / 2) % 2 === 0 ? '#eff6ff' : '#f3f4f6'; // blue-50 or gray-50

                        return (
                          <td
                            key={slot.id}
                            className="px-2 py-1 text-center border border-gray-300 cursor-pointer"
                            style={{
                              backgroundColor: isAvailable ? getTeacherColor() : bgColor,
                            }}
                            onClick={() => handleToggleAvailability(teacher, slot.id)}
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
                          onClick={() => handleDelete(teacher)}
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
          Total: {filteredTeachers.length} teacher{filteredTeachers.length !== 1 ? 's' : ''}
        </div>
      </div>

      {isModalOpen && (
        <TeacherFormModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onSave={handleSave}
          teacher={editingTeacher}
          timeSlots={timeSlots || []}
          selectedDate={selectedDate}
        />
      )}

      <NotionImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        selectedDate={selectedDate}
        type="teachers"
        previewFn={previewTeachersFromNotion}
        importFn={importTeachersFromNotion}
      />
    </div>
  );
}

export default TeachersPage;
