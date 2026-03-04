import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllIncomingBatches, deleteIncomingBatch } from '../services/api';
import IncomingBatchFormModal from './IncomingBatchFormModal';
import PredictionModal from './PredictionModal';

function IncomingStudentsSection({ selectedDate }) {
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isPredictionModalOpen, setIsPredictionModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const queryClient = useQueryClient();

  // Fetch all batches
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['incomingBatches'],
    queryFn: async () => {
      const response = await getAllIncomingBatches();
      return response.data;
    },
    refetchOnWindowFocus: false,
  });

  // Delete batch mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => deleteIncomingBatch(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['incomingBatches']);
    },
  });

  const handleAddBatch = () => {
    setEditingBatch(null);
    setIsFormModalOpen(true);
  };

  const handleEdit = (batch) => {
    setEditingBatch(batch);
    setIsFormModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this batch?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleViewPrediction = (batch) => {
    setSelectedBatch(batch);
    setIsPredictionModalOpen(true);
  };

  // Format date for display
  const formatDate = (dateStr) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Get time schedule display name
  const getTimeScheduleName = (schedule) => {
    const scheduleMap = {
      'full-day': 'Full Day (8AM-5PM)',
      'morning': 'Morning (8AM-12PM)',
      'afternoon': 'Afternoon (1PM-5PM)',
      'custom': 'Custom Schedule'
    };
    return scheduleMap[schedule] || schedule;
  };

  if (isLoading) {
    return <div className="text-center py-4">Loading incoming batches...</div>;
  }

  return (
    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl shadow-lg p-6 border-2 border-purple-200">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-purple-900">Incoming Students & Predictions</h2>
          <p className="text-sm text-purple-700 mt-1">
            Plan future hiring needs based on expected student arrivals
          </p>
        </div>
        <button
          onClick={handleAddBatch}
          className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 font-semibold shadow-md hover:shadow-lg transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Incoming Batch
        </button>
      </div>

      {batches.length === 0 ? (
        <div className="bg-white rounded-lg p-8 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Incoming Batches Yet</h3>
          <p className="text-gray-500 mb-4">Start by adding expected student arrivals to predict hiring needs</p>
          <button
            onClick={handleAddBatch}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold"
          >
            Add Your First Batch
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => (
            <div
              key={batch.id}
              className="bg-white rounded-lg p-4 shadow-md hover:shadow-lg transition-shadow border border-purple-100"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg font-bold text-purple-900">
                      {formatDate(batch.start_date)}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="text-lg font-bold text-purple-900">
                      {formatDate(batch.end_date)}
                    </span>
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">
                      {batch.duration_weeks} week{batch.duration_weeks !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <span className="font-semibold text-blue-700">{batch.student_count} students</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm text-gray-700">{getTimeScheduleName(batch.time_schedule)}</span>
                    </div>
                  </div>

                  {batch.notes && (
                    <p className="text-sm text-gray-600 mt-2">
                      <span className="font-semibold">Note:</span> {batch.notes}
                    </p>
                  )}

                  <div className="text-xs text-gray-500 mt-2">
                    Entry Date: {formatDate(batch.entry_date)}
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  <button
                    onClick={() => handleViewPrediction(batch)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold whitespace-nowrap"
                  >
                    View Prediction
                  </button>
                  <button
                    onClick={() => handleEdit(batch)}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-semibold"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(batch.id)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {isFormModalOpen && (
        <IncomingBatchFormModal
          batch={editingBatch}
          selectedDate={selectedDate}
          onClose={() => setIsFormModalOpen(false)}
        />
      )}

      {/* Prediction Modal */}
      {isPredictionModalOpen && selectedBatch && (
        <PredictionModal
          batch={selectedBatch}
          entryDate={selectedDate}
          onClose={() => setIsPredictionModalOpen(false)}
        />
      )}
    </div>
  );
}

export default IncomingStudentsSection;
