import { useQuery } from '@tanstack/react-query';
import { getIncomingBatchPrediction, getTimeSlots } from '../services/api';

function PredictionModal({ batch, entryDate, onClose }) {
  // Fetch prediction data
  const { data: prediction, isLoading } = useQuery({
    queryKey: ['prediction', entryDate, batch.start_date],
    queryFn: async () => {
      const response = await getIncomingBatchPrediction(entryDate, batch.start_date);
      return response.data;
    },
    enabled: !!entryDate && !!batch,
  });

  // Fetch time slots for display names
  const { data: timeSlots = [] } = useQuery({
    queryKey: ['timeSlots'],
    queryFn: async () => {
      const response = await getTimeSlots();
      return response.data;
    },
  });

  const formatDate = (dateStr) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTimeSlotName = (slotId) => {
    const slot = timeSlots.find(s => s.id === parseInt(slotId));
    return slot ? slot.name.replace(' to ', '-') : `Slot ${slotId}`;
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Calculating predictions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-t-xl">
          <h2 className="text-2xl font-bold mb-2">Hiring Prediction</h2>
          <p className="text-indigo-100">
            Based on incoming students for {formatDate(batch.start_date)}
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Date Context */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="text-sm text-blue-600 font-semibold mb-1">Reference Date</div>
              <div className="text-xl font-bold text-blue-900">{formatDate(prediction.entryDate)}</div>
              <div className="text-sm text-blue-700 mt-2">
                Teachers Available: <span className="font-bold">{prediction.entryData.teachers}</span>
              </div>
            </div>

            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <div className="text-sm text-purple-600 font-semibold mb-1">Target Date</div>
              <div className="text-xl font-bold text-purple-900">{formatDate(prediction.targetDate)}</div>
              <div className="text-sm text-purple-700 mt-2">
                Total Students: <span className="font-bold">{prediction.targetData.totalStudents}</span>
                {' '}({prediction.targetData.currentStudents} current + {prediction.targetData.incomingStudents} incoming)
              </div>
            </div>
          </div>

          {/* Active Batches */}
          {prediction.activeBatches && prediction.activeBatches.length > 0 && (
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <h3 className="text-lg font-bold text-purple-900 mb-3">Active Student Batches on Target Date:</h3>
              <div className="space-y-2">
                {prediction.activeBatches.map((b, idx) => (
                  <div key={idx} className="bg-white rounded p-3 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-gray-900">{b.student_count} students</span>
                      <span className="text-gray-600 ml-2">
                        ({formatDate(b.start_date)} - {formatDate(b.end_date)})
                      </span>
                    </div>
                    <span className="text-sm text-gray-600">{b.time_schedule}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hiring Needs by Time Slot */}
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
                          {data.need > 0 ? (
                            <span className="inline-block px-3 py-1 bg-red-100 text-red-700 rounded-full font-bold">
                              +{data.need}
                            </span>
                          ) : (
                            <span className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full font-bold">
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-lg p-6 border-2 border-orange-200">
            <h3 className="text-xl font-bold text-orange-900 mb-4">Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Peak Hiring Need</div>
                <div className="text-3xl font-bold text-red-600">
                  +{prediction.summary.maxNeed}
                </div>
                <div className="text-xs text-gray-500 mt-1">teachers needed</div>
              </div>

              <div className="bg-white rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Average Need</div>
                <div className="text-3xl font-bold text-orange-600">
                  +{prediction.summary.avgNeed}
                </div>
                <div className="text-xs text-gray-500 mt-1">per time slot</div>
              </div>

              <div className="bg-white rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Recommended Hire Date</div>
                <div className="text-lg font-bold text-purple-600">
                  {formatDate(prediction.summary.recommendedHireDate)}
                </div>
                <div className="text-xs text-gray-500 mt-1">2 weeks before start</div>
              </div>
            </div>

            {prediction.summary.maxNeed > 0 && (
              <div className="mt-4 bg-red-100 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 font-semibold">
                  ⚠️ Action Required: Hire at least {prediction.summary.maxNeed} more teachers before{' '}
                  {formatDate(prediction.summary.recommendedHireDate)} to ensure adequate staffing.
                </p>
              </div>
            )}

            {prediction.summary.maxNeed === 0 && (
              <div className="mt-4 bg-green-100 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 font-semibold">
                  ✅ You have sufficient teachers for this incoming batch!
                </p>
              </div>
            )}
          </div>

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

export default PredictionModal;
