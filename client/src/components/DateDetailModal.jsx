import { useQuery } from '@tanstack/react-query';
import { getIncomingBatchPrediction, getTimeSlots, getAllIncomingBatches } from '../services/api';

function DateDetailModal({ date, entryDate, onClose }) {
  // Format date in local timezone to avoid UTC conversion issues
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  // Fetch prediction for this specific date
  const { data: prediction, isLoading } = useQuery({
    queryKey: ['prediction', entryDate, dateStr],
    queryFn: async () => {
      const response = await getIncomingBatchPrediction(entryDate, dateStr);
      return response.data;
    },
    enabled: !!entryDate && !!dateStr,
  });

  // Fetch time slots for display names
  const { data: timeSlots = [] } = useQuery({
    queryKey: ['timeSlots'],
    queryFn: async () => {
      const response = await getTimeSlots();
      return response.data;
    },
  });

  // Fetch all batches to show which are active on this date
  const { data: batches = [] } = useQuery({
    queryKey: ['incomingBatches'],
    queryFn: async () => {
      const response = await getAllIncomingBatches();
      return response.data;
    },
  });

  const formatDate = (dateStr) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTimeSlotName = (slotId) => {
    const slot = timeSlots.find(s => s.id === parseInt(slotId));
    return slot ? slot.name.replace(' to ', '-') : `Slot ${slotId}`;
  };

  const getNeedColor = (need) => {
    if (need === 0) return 'bg-green-100 text-green-700';
    if (need <= 2) return 'bg-yellow-100 text-yellow-700';
    if (need <= 4) return 'bg-orange-100 text-orange-700';
    return 'bg-red-100 text-red-700';
  };

  // Get active batches for this date
  const activeBatchesOnDate = batches.filter(batch => {
    return dateStr >= batch.start_date && dateStr <= batch.end_date;
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading prediction...</p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate max need from all slots
  const maxNeed = prediction ? Math.max(...Object.values(prediction.hiringNeedsBySlot).map(s => s.need), 0) : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 rounded-t-xl">
          <h2 className="text-2xl font-bold mb-2">Hiring Prediction Details</h2>
          <p className="text-purple-100">{formatDate(dateStr)}</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Max Need Callout */}
          <div className={`rounded-lg p-6 border-2 ${
            maxNeed === 0
              ? 'bg-green-50 border-green-300'
              : maxNeed <= 2
              ? 'bg-yellow-50 border-yellow-300'
              : maxNeed <= 4
              ? 'bg-orange-50 border-orange-300'
              : 'bg-red-50 border-red-300'
          }`}>
            <div className="text-center">
              <div className="text-sm font-semibold text-gray-700 mb-2">Maximum Hiring Need for This Date</div>
              <div className={`text-5xl font-bold mb-2 ${
                maxNeed === 0
                  ? 'text-green-700'
                  : maxNeed <= 2
                  ? 'text-yellow-700'
                  : maxNeed <= 4
                  ? 'text-orange-700'
                  : 'text-red-700'
              }`}>
                {maxNeed === 0 ? '✓' : `+${maxNeed}`}
              </div>
              <div className="text-sm text-gray-600">
                {maxNeed === 0
                  ? 'No additional teachers needed'
                  : `${maxNeed} teacher${maxNeed !== 1 ? 's' : ''} needed`}
              </div>
            </div>
          </div>

          {/* Active Batches */}
          {activeBatchesOnDate.length > 0 && (
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <h3 className="text-lg font-bold text-purple-900 mb-3">
                Active Student Batches ({activeBatchesOnDate.length}):
              </h3>
              <div className="space-y-2">
                {activeBatchesOnDate.map((batch) => (
                  <div key={batch.id} className="bg-white rounded p-3 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-gray-900">{batch.student_count} students</span>
                      <span className="text-gray-600 ml-2 text-sm">
                        ({new Date(batch.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(batch.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                      </span>
                    </div>
                    <span className="text-sm text-purple-600 font-semibold">{batch.time_schedule}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeBatchesOnDate.length === 0 && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-center">
              <p className="text-gray-600">No incoming student batches active on this date</p>
            </div>
          )}

          {/* Time Slot Breakdown */}
          {prediction && (
            <div className="bg-white rounded-lg border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 p-4 bg-gray-50 border-b border-gray-200">
                Hiring Needs by Time Slot
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Time Slot</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">Total<br/>Students</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">Available<br/>Teachers</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">Buffer</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">Need to Hire</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {Object.entries(prediction.hiringNeedsBySlot || {})
                      .sort(([a], [b]) => parseInt(a) - parseInt(b))
                      .map(([slotId, data], index) => (
                        <tr key={slotId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {getTimeSlotName(slotId)}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-blue-600">
                            {data.totalStudents}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-green-600">
                            {data.availableTeachers}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-600">
                            +{data.buffer}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-3 py-1 rounded-full font-bold ${getNeedColor(data.need)}`}>
                              {data.need > 0 ? '+' : ''}{data.need}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-8 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DateDetailModal;
