import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAssignments, getTimeSlots, getRooms, deleteAllAssignments, copyDay } from '../services/api';
import SchedulingGrid from './SchedulingGrid';

function Dashboard({ selectedDate }) {
  const queryClient = useQueryClient();
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [targetDate, setTargetDate] = useState('');
  // Fetch time slots
  const { data: timeSlots, isLoading: timeSlotsLoading } = useQuery({
    queryKey: ['timeSlots'],
    queryFn: async () => {
      const response = await getTimeSlots();
      return response.data;
    },
  });

  // Fetch rooms
  const { data: rooms, isLoading: roomsLoading } = useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      const response = await getRooms();
      return response.data;
    },
  });

  // Fetch assignments for selected date
  const { data: assignments, isLoading: assignmentsLoading, refetch } = useQuery({
    queryKey: ['assignments', selectedDate],
    queryFn: async () => {
      const response = await getAssignments(selectedDate);
      return response.data;
    },
    enabled: !!selectedDate,
  });

  // Delete all assignments mutation
  const deleteAllMutation = useMutation({
    mutationFn: (date) => deleteAllAssignments(date),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['assignments']);
      alert(response.data.message || 'Assignments deleted successfully!');
    },
    onError: (error) => {
      console.error('Delete all error:', error);
      alert('Failed to delete assignments: ' + (error.response?.data?.message || error.message));
    },
  });

  // Copy day mutation
  const copyDayMutation = useMutation({
    mutationFn: copyDay,
    onSuccess: (response) => {
      queryClient.invalidateQueries(['assignments']);
      queryClient.invalidateQueries(['teachers']);
      queryClient.invalidateQueries(['students']);
      setIsCopyModalOpen(false);
      setTargetDate('');
      alert(`Successfully copied ${response.data.count} assignment(s), ${response.data.teachersCount} teacher(s), and ${response.data.studentsCount} student(s)!`);
    },
    onError: (error) => {
      console.error('Copy day error:', error);
      alert('Failed to copy day: ' + (error.response?.data?.message || error.message));
    },
  });

  const handleDeleteAll = async () => {
    const assignmentCount = assignments?.length || 0;

    const confirmed = confirm(
      `⚠️ WARNING: Delete ALL ${assignmentCount} assignment(s) for ${selectedDate}?\n\nThis will remove all assignments for this date only.\n\nA backup will be created automatically before deletion.`
    );

    if (confirmed) {
      try {
        await deleteAllMutation.mutateAsync(selectedDate);
      } catch (error) {
        console.error('Failed to delete all assignments:', error);
      }
    }
  };

  const handleCopyDay = async (e) => {
    e.preventDefault();

    if (!targetDate) {
      alert('Please select a target date');
      return;
    }

    if (selectedDate === targetDate) {
      alert('Source and target dates cannot be the same');
      return;
    }

    // Check how many assignments, teachers, and students exist on the target date
    try {
      const response = await getAssignments(targetDate);
      const existingCount = response.data.length;

      let confirmMessage = `Copy everything from ${selectedDate} to ${targetDate}?\n\n`;
      confirmMessage += `This will copy all teachers, students, and assignments from ${selectedDate} to ${targetDate}.\n\n`;

      if (existingCount > 0) {
        confirmMessage += `⚠️ WARNING: The target date already has ${existingCount} assignment(s).\n`;
        confirmMessage += `All data on ${targetDate} will be DELETED and REPLACED.\n\n`;
        confirmMessage += `Continue?`;
      }

      const confirmed = confirm(confirmMessage);

      if (confirmed) {
        await copyDayMutation.mutateAsync({
          sourceDate: selectedDate,
          targetDate: targetDate
        });
      }
    } catch (error) {
      console.error('Failed to check or copy day:', error);
      alert('Failed to copy day: ' + (error.response?.data?.message || error.message));
    }
  };

  if (timeSlotsLoading || roomsLoading || assignmentsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading schedule...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            Schedule for {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </h2>
          <div className="flex gap-3">
            <button
              onClick={() => setIsCopyModalOpen(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-md hover:shadow-lg transition-all"
            >
              Copy This Day
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={deleteAllMutation.isPending}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md hover:shadow-lg transition-all"
            >
              Delete All Assignments
            </button>
          </div>
        </div>
        <SchedulingGrid
          timeSlots={timeSlots || []}
          rooms={rooms || []}
          assignments={assignments || []}
          selectedDate={selectedDate}
          onRefetch={refetch}
        />
      </div>

      {/* Copy Week Modal */}
      {isCopyModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Copy Day Schedule</h2>
                <button
                  onClick={() => {
                    setIsCopyModalOpen(false);
                    setTargetDate('');
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCopyDay} className="space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    This will copy all teachers, students, and assignments from <strong>{selectedDate}</strong> to another date.
                  </p>
                </div>

                <div>
                  <label htmlFor="targetDate" className="block text-sm font-semibold mb-2">
                    Target Date *
                  </label>
                  <input
                    id="targetDate"
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCopyModalOpen(false);
                      setTargetDate('');
                    }}
                    className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={copyDayMutation.isPending}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold"
                  >
                    {copyDayMutation.isPending ? 'Copying...' : 'Copy Day'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
