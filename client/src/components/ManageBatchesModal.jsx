import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAllIncomingBatches,
  deleteIncomingBatch,
  archiveIncomingBatch,
  reactivateIncomingBatch,
  bulkArchiveIncomingBatches
} from '../services/api';

function ManageBatchesModal({ onClose, onEdit }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'fulfilled', 'archived'
  const [selectedBatches, setSelectedBatches] = useState(new Set());

  // Fetch all batches
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['incomingBatches'],
    queryFn: async () => {
      const response = await getAllIncomingBatches();
      return response.data;
    },
  });

  // Delete batch mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => deleteIncomingBatch(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['incomingBatches']);
      queryClient.invalidateQueries(['calendarPredictions']);
    },
  });

  // Archive batch mutation
  const archiveMutation = useMutation({
    mutationFn: (id) => archiveIncomingBatch(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['incomingBatches']);
      queryClient.invalidateQueries(['calendarPredictions']);
      setSelectedBatches(new Set());
    },
  });

  // Reactivate batch mutation
  const reactivateMutation = useMutation({
    mutationFn: (id) => reactivateIncomingBatch(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['incomingBatches']);
      queryClient.invalidateQueries(['calendarPredictions']);
      setSelectedBatches(new Set());
    },
  });

  // Bulk archive mutation
  const bulkArchiveMutation = useMutation({
    mutationFn: (ids) => bulkArchiveIncomingBatches(ids),
    onSuccess: () => {
      queryClient.invalidateQueries(['incomingBatches']);
      queryClient.invalidateQueries(['calendarPredictions']);
      setSelectedBatches(new Set());
    },
  });

  const handleDelete = async (id, batchInfo) => {
    if (window.confirm(`Are you sure you want to delete this batch?\n\n${batchInfo}`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleArchive = (id) => {
    archiveMutation.mutate(id);
  };

  const handleReactivate = (id) => {
    reactivateMutation.mutate(id);
  };

  const handleBulkArchive = () => {
    if (selectedBatches.size === 0) return;

    if (window.confirm(`Archive ${selectedBatches.size} selected batch(es)?`)) {
      bulkArchiveMutation.mutate(Array.from(selectedBatches));
    }
  };

  const handleBulkArchiveFulfilled = () => {
    const fulfilledIds = filteredBatches
      .filter(b => b.status === 'fulfilled')
      .map(b => b.id);

    if (fulfilledIds.length === 0) {
      alert('No fulfilled batches to archive');
      return;
    }

    if (window.confirm(`Archive all ${fulfilledIds.length} fulfilled batch(es)?`)) {
      bulkArchiveMutation.mutate(fulfilledIds);
    }
  };

  const toggleBatchSelection = (id) => {
    const newSelection = new Set(selectedBatches);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedBatches(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedBatches.size === filteredBatches.length) {
      setSelectedBatches(new Set());
    } else {
      setSelectedBatches(new Set(filteredBatches.map(b => b.id)));
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTimeScheduleName = (schedule) => {
    const scheduleMap = {
      'full-day': 'Full Day (8AM-5PM)',
      'morning': 'Morning (8AM-12PM)',
      'afternoon': 'Afternoon (1PM-5PM)',
    };
    return scheduleMap[schedule] || schedule;
  };

  const getStatusBadge = (status) => {
    const badges = {
      active: {
        bg: 'bg-green-100',
        text: 'text-green-700',
        border: 'border-green-300',
        label: 'Active',
        icon: '🟢'
      },
      fulfilled: {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        border: 'border-blue-300',
        label: 'Fulfilled',
        icon: '✅'
      },
      archived: {
        bg: 'bg-gray-100',
        text: 'text-gray-700',
        border: 'border-gray-300',
        label: 'Archived',
        icon: '📦'
      }
    };

    const badge = badges[status] || badges.active;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${badge.bg} ${badge.text} ${badge.border}`}>
        <span>{badge.icon}</span>
        <span>{badge.label}</span>
      </span>
    );
  };

  // Filter batches by status
  const filteredBatches = batches.filter(batch => {
    if (statusFilter === 'all') return true;
    return batch.status === statusFilter;
  });

  // Count batches by status
  const statusCounts = {
    all: batches.length,
    active: batches.filter(b => b.status === 'active').length,
    fulfilled: batches.filter(b => b.status === 'fulfilled').length,
    archived: batches.filter(b => b.status === 'archived').length,
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 rounded-t-xl z-10">
          <h2 className="text-2xl font-bold mb-2">Manage Incoming Batches</h2>
          <p className="text-purple-100">View, edit, archive, or delete predicted student batches</p>
        </div>

        <div className="p-6">
          {/* Filter Tabs */}
          <div className="flex items-center gap-2 mb-4 border-b border-gray-200 pb-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-2 rounded-t text-sm font-semibold transition-colors ${
                statusFilter === 'all'
                  ? 'bg-purple-100 text-purple-700 border-b-2 border-purple-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              All ({statusCounts.all})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-4 py-2 rounded-t text-sm font-semibold transition-colors ${
                statusFilter === 'active'
                  ? 'bg-green-100 text-green-700 border-b-2 border-green-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              🟢 Active ({statusCounts.active})
            </button>
            <button
              onClick={() => setStatusFilter('fulfilled')}
              className={`px-4 py-2 rounded-t text-sm font-semibold transition-colors ${
                statusFilter === 'fulfilled'
                  ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              ✅ Fulfilled ({statusCounts.fulfilled})
            </button>
            <button
              onClick={() => setStatusFilter('archived')}
              className={`px-4 py-2 rounded-t text-sm font-semibold transition-colors ${
                statusFilter === 'archived'
                  ? 'bg-gray-100 text-gray-700 border-b-2 border-gray-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              📦 Archived ({statusCounts.archived})
            </button>
          </div>

          {/* Bulk Actions Bar */}
          {filteredBatches.length > 0 && (
            <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedBatches.size === filteredBatches.length && filteredBatches.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700">
                  {selectedBatches.size > 0 ? `${selectedBatches.size} selected` : 'Select all'}
                </span>
              </div>

              {selectedBatches.size > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleBulkArchive}
                    disabled={bulkArchiveMutation.isPending}
                    className="px-3 py-1.5 bg-gray-600 text-white rounded text-xs font-semibold hover:bg-gray-700 disabled:opacity-50"
                  >
                    {bulkArchiveMutation.isPending ? 'Archiving...' : `Archive Selected (${selectedBatches.size})`}
                  </button>
                </div>
              )}

              {statusFilter === 'fulfilled' && statusCounts.fulfilled > 0 && (
                <button
                  onClick={handleBulkArchiveFulfilled}
                  disabled={bulkArchiveMutation.isPending}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  Archive All Fulfilled ({statusCounts.fulfilled})
                </button>
              )}
            </div>
          )}

          {/* Batches List */}
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading batches...</p>
            </div>
          ) : filteredBatches.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                {statusFilter === 'all' ? 'No Batches' : `No ${statusFilter} batches`}
              </h3>
              <p className="text-gray-500">
                {statusFilter === 'all'
                  ? "You haven't created any incoming student batches yet"
                  : `No batches with ${statusFilter} status`
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBatches.map((batch) => (
                <div
                  key={batch.id}
                  className={`bg-gray-50 rounded-lg p-4 border transition-all ${
                    selectedBatches.has(batch.id)
                      ? 'border-purple-400 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedBatches.has(batch.id)}
                      onChange={() => toggleBatchSelection(batch.id)}
                      className="mt-1 w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                    />

                    {/* Batch Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        {getStatusBadge(batch.status)}
                        <span className="text-base font-bold text-purple-900">
                          {formatDate(batch.start_date)}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className="text-base font-bold text-purple-900">
                          {formatDate(batch.end_date)}
                        </span>
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                          {batch.duration_weeks} week{batch.duration_weeks !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                          </svg>
                          <span className="font-semibold text-blue-700">{batch.student_count} students</span>
                        </div>

                        {batch.teacher_count > 0 && (
                          <div className="flex items-center gap-1">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span className="font-semibold text-green-700">{batch.teacher_count} teachers</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-xs text-gray-700">{getTimeScheduleName(batch.time_schedule)}</span>
                        </div>
                      </div>

                      {batch.notes && (
                        <p className="text-xs text-gray-600 mt-2">
                          <span className="font-semibold">Note:</span> {batch.notes}
                        </p>
                      )}

                      <div className="text-xs text-gray-500 mt-2">
                        Reference: {formatDate(batch.entry_date)}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2 ml-4">
                      {batch.status === 'active' && (
                        <>
                          <button
                            onClick={() => onEdit(batch)}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 whitespace-nowrap"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleArchive(batch.id)}
                            disabled={archiveMutation.isPending}
                            className="px-3 py-1.5 bg-gray-600 text-white rounded text-xs font-semibold hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            Archive
                          </button>
                        </>
                      )}

                      {batch.status === 'fulfilled' && (
                        <>
                          <button
                            onClick={() => handleArchive(batch.id)}
                            disabled={archiveMutation.isPending}
                            className="px-3 py-1.5 bg-gray-600 text-white rounded text-xs font-semibold hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            Archive
                          </button>
                          <button
                            onClick={() => handleReactivate(batch.id)}
                            disabled={reactivateMutation.isPending}
                            className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            Reactivate
                          </button>
                        </>
                      )}

                      {batch.status === 'archived' && (
                        <button
                          onClick={() => handleReactivate(batch.id)}
                          disabled={reactivateMutation.isPending}
                          className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                        >
                          Reactivate
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(
                          batch.id,
                          `${batch.student_count} students\n${formatDate(batch.start_date)} - ${formatDate(batch.end_date)}`
                        )}
                        disabled={deleteMutation.isPending}
                        className="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end mt-6 pt-4 border-t">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ManageBatchesModal;
