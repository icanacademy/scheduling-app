import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

function NotionImportModal({ isOpen, onClose, selectedDate, type, previewFn, importFn }) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(true);

  // Fetch preview data
  const { data: previewData, isLoading, error } = useQuery({
    queryKey: ['notion-preview', type, selectedDate],
    queryFn: async () => {
      const response = await previewFn(selectedDate);
      return response.data;
    },
    enabled: isOpen && !!selectedDate,
  });

  const items = type === 'teachers' ? previewData?.teachers : previewData?.students;

  // Initialize selected IDs when data loads
  useEffect(() => {
    if (items) {
      const newIds = items.filter(item => !item.alreadyExists).map(item => item.notionId);
      setSelectedIds(new Set(newIds));
      setSelectAll(newIds.length === items.length);
    }
  }, [items]);

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (data) => importFn(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries([type]);
      const data = response.data;

      let message = data.message;
      if (data.skippedTeachers || data.skippedStudents) {
        const skipped = data.skippedTeachers || data.skippedStudents;
        message += `\n\nSkipped (already exist):\n• ${skipped.join('\n• ')}`;
      }

      alert(message);
      onClose();
    },
    onError: (error) => {
      alert(`Import failed: ${error.response?.data?.message || error.message}`);
    },
  });

  const handleToggle = (notionId) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(notionId)) {
      newSet.delete(notionId);
    } else {
      newSet.add(notionId);
    }
    setSelectedIds(newSet);
    setSelectAll(newSet.size === items.length);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedIds(new Set(items.map(item => item.notionId)));
      setSelectAll(true);
    }
  };

  const handleImport = () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one item to import');
      return;
    }

    const confirmed = confirm(
      `Import ${selectedIds.size} ${type} from Notion?\n\nDuplicates will be automatically skipped.`
    );

    if (confirmed) {
      importMutation.mutate({
        date: selectedDate,
        selectedIds: Array.from(selectedIds),
        skipDuplicates: true
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              Import {type === 'teachers' ? 'Teachers' : 'Students'} from Notion
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              &times;
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Select which {type} to import for {selectedDate}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <div className="text-center py-12 text-gray-600">
              Loading {type} from Notion...
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-red-600 font-semibold mb-2">Failed to load from Notion</p>
              <p className="text-sm text-gray-600">{error.response?.data?.error || error.message}</p>
            </div>
          )}

          {items && items.length === 0 && (
            <div className="text-center py-12 text-gray-600">
              No active {type} found in Notion
            </div>
          )}

          {items && items.length > 0 && (
            <div className="space-y-3">
              {/* Select All */}
              <div className="flex items-center p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                  className="w-5 h-5 text-blue-600 rounded cursor-pointer"
                />
                <label className="ml-3 font-semibold text-blue-900 cursor-pointer" onClick={handleSelectAll}>
                  Select All ({items.length})
                </label>
              </div>

              {/* Items List */}
              {items.map((item) => (
                <div
                  key={item.notionId}
                  className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    item.alreadyExists
                      ? 'bg-gray-50 border-gray-300 opacity-60'
                      : selectedIds.has(item.notionId)
                      ? 'bg-green-50 border-green-500'
                      : 'bg-white border-gray-300 hover:border-blue-400'
                  }`}
                  onClick={() => !item.alreadyExists && handleToggle(item.notionId)}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.notionId)}
                    onChange={() => handleToggle(item.notionId)}
                    disabled={item.alreadyExists}
                    className="w-5 h-5 text-green-600 rounded cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="ml-3 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">{item.name}</span>
                      {item.alreadyExists && (
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded-full">
                          Already Exists
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {item.startTime} - {item.endTime} ({item.availability.length} slot{item.availability.length !== 1 ? 's' : ''})
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {selectedIds.size} of {items?.length || 0} selected
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-100 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importMutation.isPending || selectedIds.size === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                {importMutation.isPending ? 'Importing...' : `Import ${selectedIds.size} ${type === 'teachers' ? 'Teacher' : 'Student'}${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NotionImportModal;
