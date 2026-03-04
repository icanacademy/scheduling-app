import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { createIncomingBatch, updateIncomingBatch, getTimeSlots } from '../services/api';

function IncomingBatchFormModal({ batch, selectedDate, onClose }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    entry_date: selectedDate,
    start_date: '',
    end_date: '',
    student_count: 0,
    teacher_count: 0,
    time_schedule: 'full-day',
    notes: ''
  });

  // Fetch time slots
  const { data: timeSlots = [] } = useQuery({
    queryKey: ['timeSlots'],
    queryFn: async () => {
      const response = await getTimeSlots();
      return response.data;
    },
  });

  // Map time schedule to time slot IDs
  const getTimeSlotIds = (schedule) => {
    if (!timeSlots.length) return [];

    switch (schedule) {
      case 'full-day':
        // 8AM-5PM: slots 1-8 (8 slots, excluding lunch)
        return [1, 2, 3, 4, 5, 6, 7, 8];
      case 'morning':
        // 8AM-12PM: slots 1-4
        return [1, 2, 3, 4];
      case 'afternoon':
        // 1PM-5PM: slots 5-8
        return [5, 6, 7, 8];
      default:
        return [];
    }
  };

  useEffect(() => {
    if (batch) {
      // Editing existing batch
      setFormData({
        entry_date: batch.entry_date,
        start_date: batch.start_date,
        end_date: batch.end_date,
        student_count: batch.student_count || 0,
        teacher_count: batch.teacher_count || 0,
        time_schedule: batch.time_schedule,
        notes: batch.notes || ''
      });
    } else {
      // Creating new batch - reset form with current selectedDate
      setFormData({
        entry_date: selectedDate,
        start_date: '',
        end_date: '',
        student_count: 0,
        teacher_count: 0,
        time_schedule: 'full-day',
        notes: ''
      });
    }
  }, [batch, selectedDate]);

  // Create/Update mutation
  const mutation = useMutation({
    mutationFn: (data) => {
      if (batch) {
        return updateIncomingBatch(batch.id, data);
      } else {
        return createIncomingBatch(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['incomingBatches']);
      queryClient.invalidateQueries(['calendarPredictions']);
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validation: At least one of student_count or teacher_count must be > 0
    if (formData.student_count === 0 && formData.teacher_count === 0) {
      alert('Please enter at least one student or teacher (both cannot be 0)');
      return;
    }

    // Validation: Check dates are filled
    if (!formData.start_date || !formData.end_date) {
      alert('Please enter both start date and end date');
      return;
    }

    const timeSlotIds = getTimeSlotIds(formData.time_schedule);

    // Calculate duration_weeks from start_date and end_date
    const start = new Date(formData.start_date + 'T00:00:00');
    const end = new Date(formData.end_date + 'T00:00:00');
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const duration_weeks = Math.ceil(diffDays / 7);

    const dataToSubmit = {
      ...formData,
      duration_weeks,
      time_slots: timeSlotIds
    };

    console.log('Submitting batch data:', dataToSubmit);
    mutation.mutate(dataToSubmit);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 rounded-t-xl z-10">
          <h2 className="text-2xl font-bold">
            {batch ? 'Edit Incoming Batch' : 'Add Incoming Batch'}
          </h2>
          <p className="text-purple-100 text-sm mt-1">
            Add predicted incoming students, teachers, or both
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Entry Date (Reference Date) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Entry Date (Reference Date)
            </label>
            <input
              type="date"
              value={formData.entry_date}
              onChange={(e) => handleChange('entry_date', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Reference date for baseline comparison (usually today or your current selected date)
            </p>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => handleChange('start_date', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              When will they start?
            </p>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={formData.end_date}
              onChange={(e) => handleChange('end_date', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              End date of this batch period
            </p>
          </div>

          {/* Student and Teacher Counts - Always Visible */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Incoming Count
            </label>
            <div className="space-y-4">
              {/* Student Count */}
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-20 text-center">
                  <div className="text-3xl">👥</div>
                  <div className="text-xs text-gray-600 mt-1 font-medium">Students</div>
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.student_count}
                    onChange={(e) => handleChange('student_count', parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Number of incoming students (0 = none)
                  </p>
                </div>
              </div>

              {/* Teacher Count */}
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-20 text-center">
                  <div className="text-3xl">👨‍🏫</div>
                  <div className="text-xs text-gray-600 mt-1 font-medium">Teachers</div>
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.teacher_count}
                    onChange={(e) => handleChange('teacher_count', parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Number of incoming teachers (0 = none)
                  </p>
                </div>
              </div>
            </div>

            {/* Validation Hint */}
            {formData.student_count === 0 && formData.teacher_count === 0 && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ Please enter at least one student or teacher
                </p>
              </div>
            )}
          </div>

          {/* Time Schedule */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Time Schedule
            </label>
            <select
              value={formData.time_schedule}
              onChange={(e) => handleChange('time_schedule', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            >
              <option value="full-day">Full Day (8AM-5PM)</option>
              <option value="morning">Morning (8AM-12PM)</option>
              <option value="afternoon">Afternoon (1PM-5PM)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Time availability for this batch
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              rows="3"
              placeholder="Any additional notes about this batch..."
            />
          </div>

          {/* Summary Preview */}
          {formData.start_date && formData.end_date && (formData.student_count > 0 || formData.teacher_count > 0) && (
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <h3 className="text-sm font-semibold text-purple-900 mb-2">Summary:</h3>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-semibold">Duration:</span>{' '}
                  {(() => {
                    const start = new Date(formData.start_date + 'T00:00:00');
                    const end = new Date(formData.end_date + 'T00:00:00');
                    const diffTime = Math.abs(end - start);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const weeks = Math.ceil(diffDays / 7);
                    return `${weeks} weeks (${diffDays} days)`;
                  })()}
                </p>
                {formData.student_count > 0 && (
                  <p className="text-blue-700">
                    <span className="font-semibold">👥 Students:</span> {formData.student_count}
                  </p>
                )}
                {formData.teacher_count > 0 && (
                  <p className="text-green-700">
                    <span className="font-semibold">👨‍🏫 Teachers:</span> {formData.teacher_count}
                  </p>
                )}
                <p>
                  <span className="font-semibold">Schedule:</span>{' '}
                  {formData.time_schedule === 'full-day' && 'Full Day (8AM-5PM)'}
                  {formData.time_schedule === 'morning' && 'Morning (8AM-12PM)'}
                  {formData.time_schedule === 'afternoon' && 'Afternoon (1PM-5PM)'}
                </p>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || (formData.student_count === 0 && formData.teacher_count === 0)}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? 'Saving...' : (batch ? 'Update Batch' : 'Create Batch')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default IncomingBatchFormModal;
