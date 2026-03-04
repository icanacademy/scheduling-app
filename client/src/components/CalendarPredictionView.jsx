import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAllIncomingBatches, getIncomingBatchPrediction, getPendingReviewBatches } from '../services/api';
import IncomingBatchFormModal from './IncomingBatchFormModal';
import DateDetailModal from './DateDetailModal';
import ManageBatchesModal from './ManageBatchesModal';

function CalendarPredictionView({ selectedDate }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const date = new Date(selectedDate + 'T00:00:00');
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [selectedDateForDetail, setSelectedDateForDetail] = useState(null);
  const [batchForDate, setBatchForDate] = useState(null);
  const [editingBatch, setEditingBatch] = useState(null);
  const [showBanner, setShowBanner] = useState(true);

  // Fetch all batches
  const { data: batches = [] } = useQuery({
    queryKey: ['incomingBatches'],
    queryFn: async () => {
      const response = await getAllIncomingBatches();
      return response.data;
    },
    refetchOnWindowFocus: false,
  });

  // Fetch batches pending review
  const { data: pendingBatches = [] } = useQuery({
    queryKey: ['pendingReviewBatches'],
    queryFn: async () => {
      const response = await getPendingReviewBatches();
      return response.data;
    },
    refetchOnWindowFocus: false,
  });

  // Watch for changes to teachers/students/assignments to trigger prediction refresh
  const queryClient = useQueryClient();
  useEffect(() => {
    let debounceTimer;
    // Listen for changes in teacher, student, or assignment data
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.queryKey) {
        const key = event.query.queryKey[0];
        // If teachers, students, or assignments change, invalidate predictions (debounced)
        if (key === 'teachers' || key === 'students' || key === 'assignments') {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            queryClient.invalidateQueries(['calendarPredictions']);
          }, 1000); // Debounce by 1 second
        }
      }
    });

    return () => {
      clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [queryClient]);

  // Get calendar days for current month
  const getCalendarDays = () => {
    const firstDay = new Date(currentMonth.year, currentMonth.month, 1);
    const lastDay = new Date(currentMonth.year, currentMonth.month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(currentMonth.year, currentMonth.month, day));
    }

    return days;
  };

  // Memoize unique dates to prevent infinite rerenders
  const uniqueDates = useMemo(() => {
    const dates = new Set();

    // Add reference date (always show baseline)
    dates.add(selectedDate);

    // Add today's date (always show current status)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    dates.add(today);

    // Add ALL dates in the current month that are >= reference date
    // (No point showing predictions for dates before our baseline)
    const monthStart = new Date(currentMonth.year, currentMonth.month, 1);
    const monthEnd = new Date(currentMonth.year, currentMonth.month + 1, 0);
    const refDate = new Date(selectedDate + 'T00:00:00');

    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
      if (d >= refDate) {
        // Format date in local timezone (YYYY-MM-DD)
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dates.add(dateStr);
      }
    }

    return Array.from(dates).sort(); // Sort for consistent query key
  }, [currentMonth.year, currentMonth.month, selectedDate]);

  // Create a stable query key string from uniqueDates
  const uniqueDatesKey = uniqueDates.join(',');

  // Fetch predictions for all unique dates
  const predictionQueries = useQuery({
    queryKey: ['calendarPredictions', selectedDate, currentMonth.year, currentMonth.month, uniqueDatesKey],
    queryFn: async () => {
      // Don't fetch if no dates
      if (uniqueDates.length === 0) {
        return {};
      }

      // Fetch predictions for all unique dates in parallel
      const predictions = await Promise.all(
        uniqueDates.map(async (dateStr) => {
          const response = await getIncomingBatchPrediction(selectedDate, dateStr);
          return { date: dateStr, data: response.data };
        })
      );

      // Convert array to map for easy lookup
      const predictionMap = {};
      predictions.forEach(({ date, data }) => {
        // Calculate need range (min to max) across all time slots
        const needValues = Object.values(data.hiringNeedsBySlot).map(s => s.need);
        const maxNeed = Math.max(...needValues);
        const minNeed = Math.min(...needValues);

        // Calculate baseline need range
        const baselineNeedValues = Object.values(data.hiringNeedsBySlot).map(s => s.baselineNeed || 0);
        const maxBaselineNeed = Math.max(...baselineNeedValues);
        const minBaselineNeed = Math.min(...baselineNeedValues);

        // Check if any actual data exists (students or teachers added)
        const hasActualData = data.targetHasData;

        // Debug log for checking data
        if (date >= '2024-12-25') {
          console.log(`[Frontend] ${date}: hasActualData=${hasActualData}, targetHasData=${data.targetHasData}`);
        }

        predictionMap[date] = {
          maxNeed,
          minNeed,
          maxBaselineNeed,
          minBaselineNeed,
          batchCount: data.activeBatches.length,
          hasActualData,
          targetData: data.targetData
        };
      });

      return predictionMap;
    },
    enabled: uniqueDates.length > 0,
    refetchOnWindowFocus: false,
    staleTime: 30000, // 30 seconds cache
  });

  // Get max need for a specific date from cached predictions
  const calculateMaxNeedForDate = (date) => {
    if (!date) return null;

    // Format date in local timezone to match predictionQueries.data keys (YYYY-MM-DD)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    // Check if we have prediction data for this date
    if (predictionQueries.data && predictionQueries.data[dateStr]) {
      return predictionQueries.data[dateStr];
    }

    return null;
  };

  // Get color class based on absolute need (same logic as bottom dashboard)
  const getNeedColor = (need) => {
    if (need === null || need === undefined) return '';

    // Negative = surplus (more teachers than needed) - show bright green
    if (need < 0) return 'bg-emerald-200 text-emerald-800 border-emerald-400';

    // Zero = perfectly balanced
    if (need === 0) return 'bg-green-100 text-green-700 border-green-300';

    // Positive = need more teachers
    if (need <= 2) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    if (need <= 4) return 'bg-orange-100 text-orange-700 border-orange-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  // Navigate months
  const previousMonth = () => {
    setCurrentMonth(prev => {
      const newMonth = prev.month - 1;
      if (newMonth < 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { year: prev.year, month: newMonth };
    });
  };

  const nextMonth = () => {
    setCurrentMonth(prev => {
      const newMonth = prev.month + 1;
      if (newMonth > 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { year: prev.year, month: newMonth };
    });
  };

  const handleDateClick = (date) => {
    if (!date) return;
    setSelectedDateForDetail(date);
  };

  const handleAddBatch = (date = null) => {
    setEditingBatch(null);
    setBatchForDate(date);
    setIsFormModalOpen(true);
  };

  const handleEditBatch = (batch) => {
    setEditingBatch(batch);
    setBatchForDate(null);
    setIsManageModalOpen(false);
    setIsFormModalOpen(true);
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const calendarDays = getCalendarDays();

  return (
    <div className="bg-white rounded border border-purple-200 p-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-purple-900">Hiring Prediction Calendar</h2>
          {predictionQueries.isFetching && (
            <div className="text-xs text-purple-600 flex items-center gap-1">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-600"></div>
              <span>Updating...</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsManageModalOpen(true)}
            className="px-2 py-1 bg-gray-600 text-white rounded text-xs font-semibold hover:bg-gray-700"
          >
            Manage Batches
          </button>
          <button
            onClick={() => handleAddBatch()}
            className="px-2 py-1 bg-purple-600 text-white rounded text-xs font-semibold hover:bg-purple-700"
          >
            + Add Batch
          </button>
        </div>
      </div>

      {/* Notification Banner for Pending Review Batches */}
      {showBanner && pendingBatches.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-yellow-800">
                ⚠️ {pendingBatches.length} batch{pendingBatches.length !== 1 ? 'es' : ''} {pendingBatches.length !== 1 ? 'have' : 'has'} passed {pendingBatches.length !== 1 ? 'their' : 'its'} start date
              </p>
              <p className="text-xs text-yellow-700">
                These batches may have been fulfilled. Review and archive them to keep predictions accurate.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsManageModalOpen(true)}
              className="px-3 py-1.5 bg-yellow-600 text-white rounded text-xs font-semibold hover:bg-yellow-700 whitespace-nowrap"
            >
              Review Batches →
            </button>
            <button
              onClick={() => setShowBanner(false)}
              className="text-yellow-600 hover:text-yellow-800 p-1"
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Calendar */}
      <div className="bg-gray-50 rounded p-2">
        {/* Month Navigation with Peak Need */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={previousMonth}
            className="px-2 py-0.5 bg-white hover:bg-gray-100 rounded text-xs font-medium border"
          >
            ←
          </button>
          <div className="text-center">
            <h3 className="text-sm font-bold text-gray-900">
              {monthNames[currentMonth.month]} {currentMonth.year}
            </h3>
            {predictionQueries.data && Object.keys(predictionQueries.data).length > 0 && (() => {
              const maxNeed = Math.max(...Object.values(predictionQueries.data).map(d => d.maxNeed));
              const maxDateEntry = Object.entries(predictionQueries.data).find(([_, d]) => d.maxNeed === maxNeed);
              const maxDate = maxDateEntry?.[0];
              const maxDateData = maxDateEntry?.[1];
              const hasActualData = maxDateData?.hasActualData;

              return (
                <div className="text-[10px] text-gray-600 mt-0.5">
                  Peak: <span className={`font-bold ${
                    maxNeed === 0 ? 'text-green-600' :
                    maxNeed <= 2 ? 'text-yellow-600' :
                    maxNeed <= 4 ? 'text-orange-600' : 'text-red-600'
                  }`}>+{maxNeed}</span> {maxDate && `on ${new Date(maxDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  {hasActualData && <span className="ml-1 text-blue-600 font-bold">✓</span>}
                </div>
              );
            })()}
          </div>
          <button
            onClick={nextMonth}
            className="px-2 py-0.5 bg-white hover:bg-gray-100 rounded text-xs font-medium border"
          >
            →
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Day Headers */}
          {dayNames.map(day => (
            <div key={day} className="text-center font-medium text-gray-600 text-xs py-1">
              {day.substring(0, 1)}
            </div>
          ))}

          {/* Calendar Days */}
          {calendarDays.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="h-14"></div>;
            }

            const needData = calculateMaxNeedForDate(date);
            const hasData = needData !== null;
            const isToday = date.toDateString() === new Date().toDateString();
            // Format date in local timezone to match selectedDate format (YYYY-MM-DD)
            const localDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const isReferenceDate = localDateStr === selectedDate;
            const hasActualData = needData?.hasActualData;
            const isPast = date < new Date(selectedDate + 'T00:00:00');

            // Debug specific dates
            if (localDateStr >= '2025-11-25' && localDateStr <= '2025-11-27') {
              console.log(`[Render] ${localDateStr}: hasActualData=${hasActualData}, isPast=${isPast}, isRef=${isReferenceDate}, willShowBlue=${hasActualData && !isPast && !isReferenceDate}`);
            }

            return (
              <div
                key={date.toISOString()}
                onClick={() => handleDateClick(date)}
                className={`
                  h-14 border rounded p-1 cursor-pointer
                  transition-all hover:shadow-md hover:scale-105 flex flex-col items-center justify-center
                  ${isPast ? 'bg-gray-100 border-gray-300 opacity-50' : hasData ? getNeedColor(needData.maxNeed) : 'bg-white border-gray-200'}
                  ${isToday ? 'ring-2 ring-blue-500' : ''}
                  ${isReferenceDate ? 'ring-2 ring-purple-500' : ''}
                  ${hasActualData && !isPast && !isReferenceDate ? 'ring-2 ring-offset-1 ring-blue-400' : ''}
                `}
              >
                <div className={`text-[10px] font-bold leading-none ${isPast ? 'text-gray-500' : 'text-gray-800'}`}>
                  {date.getDate()}
                  {isReferenceDate && <div className="text-[7px] text-purple-600">REF</div>}
                </div>
                {hasData && !isPast && (
                  <div className="text-[9px] leading-tight mt-0.5 text-center">
                    {hasActualData ? (
                      <>
                        <div className="line-through opacity-60 text-[7px]">
                          {needData.minBaselineNeed === needData.maxBaselineNeed
                            ? `${needData.maxBaselineNeed >= 0 ? '+' : ''}${needData.maxBaselineNeed}`
                            : `${needData.minBaselineNeed} to ${needData.maxBaselineNeed >= 0 ? '+' : ''}${needData.maxBaselineNeed}`
                          }
                        </div>
                        <div className="font-bold text-[8px]">
                          {needData.minNeed === needData.maxNeed
                            ? `${needData.maxNeed >= 0 ? '+' : ''}${needData.maxNeed}`
                            : `${needData.minNeed} to ${needData.maxNeed >= 0 ? '+' : ''}${needData.maxNeed}`
                          }
                        </div>
                      </>
                    ) : (
                      <div className="font-bold text-[8px]">
                        {needData.minNeed === needData.maxNeed ? (
                          // Single value
                          <>
                            {needData.maxNeed > 0 && '+'}
                            {needData.maxNeed === 0 && '0'}
                            {needData.maxNeed < 0 && needData.maxNeed}
                          </>
                        ) : (
                          // Range
                          <>
                            {needData.minNeed} to {needData.maxNeed >= 0 ? '+' : ''}{needData.maxNeed}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {isPast && hasData && (
                  <div className="text-[8px] text-gray-500">past</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-2 pt-2 border-t border-gray-200">
          <div className="text-[9px] text-gray-700 font-semibold mb-1 text-center">
            Hiring needs per day (range across time slots) - Same calculation as dashboard below
          </div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded bg-emerald-200 border border-emerald-400"></div>
              <span>Surplus</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded bg-green-100 border border-green-300"></div>
              <span>Balanced (0)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded bg-yellow-100 border border-yellow-300"></div>
              <span>Need 1-2</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded bg-orange-100 border border-orange-300"></div>
              <span>Need 3-4</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded bg-red-100 border border-red-300"></div>
              <span>Need 5+</span>
            </div>
          </div>
          <div className="text-[9px] text-gray-600 text-center space-x-2">
            <span className="text-purple-600 font-semibold">Purple</span> = Reference
            <span>|</span>
            <span className="text-blue-600 font-semibold">Blue</span> = Today/Has data
            <span>|</span>
            <span className="text-gray-500">Gray</span> = Before reference
            <span>|</span>
            <span className="font-semibold">Color = Worst slot (max need)</span>
          </div>
        </div>
      </div>

      {/* Modals */}
      {isFormModalOpen && (
        <IncomingBatchFormModal
          batch={editingBatch}
          selectedDate={selectedDate}
          initialStartDate={batchForDate}
          onClose={() => {
            setIsFormModalOpen(false);
            setBatchForDate(null);
            setEditingBatch(null);
          }}
        />
      )}

      {isManageModalOpen && (
        <ManageBatchesModal
          onClose={() => setIsManageModalOpen(false)}
          onEdit={handleEditBatch}
        />
      )}

      {selectedDateForDetail && (
        <DateDetailModal
          date={selectedDateForDetail}
          entryDate={selectedDate}
          onClose={() => setSelectedDateForDetail(null)}
        />
      )}
    </div>
  );
}

export default CalendarPredictionView;
