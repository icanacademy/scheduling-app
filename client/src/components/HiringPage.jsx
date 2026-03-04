import { useQuery } from '@tanstack/react-query';
import { getTimeSlots, getTeachers, getStudents, getAssignments } from '../services/api';
import CalendarPredictionView from './CalendarPredictionView';

function HiringPage({ selectedDate }) {

  // Calculate 10 working days before selected date
  const calculateStartDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    let workingDaysCount = 0;
    let currentDate = new Date(date);

    // Go back 10 working days
    while (workingDaysCount < 10) {
      currentDate.setDate(currentDate.getDate() - 1);
      const dayOfWeek = currentDate.getDay();
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDaysCount++;
      }
    }

    return currentDate;
  };

  // Map time slot IDs to their start times
  const getSlotStartTime = (slotId) => {
    const startTimeMap = {
      1: '8AM', 2: '9AM', 3: '10AM', 4: '11AM', 5: '1PM',
      6: '2PM', 7: '3PM', 8: '4PM', 9: '5PM', 10: '6PM',
      11: '7PM', 12: '8PM', 13: '9PM'
    };
    return startTimeMap[slotId] || '';
  };

  // Optimize hiring: maximize full-time (8h), then part-time (4h)
  // Shifts can only start at: 8AM, 10AM, 1PM, 3PM, 5PM
  const optimizeHiring = () => {
    if (!timeSlots || !teachers || !students || !assignments) {
      return { recommendations: [], totalNeeded: 0 };
    }

    // Calculate needs for each slot
    const needs = {};
    timeSlots.forEach((slot) => {
      const stats = calculateStats(slot.id);
      needs[slot.id] = Math.max(0, stats.hiringNeed);
    });

    // Allowed shift start times (slot IDs)
    // Note: Lunch break (12PM-1PM) is implicit - it's the gap between slot 4 (11AM-12PM) and slot 5 (1PM-2PM)
    // Slots: 1=8AM-9AM, 2=9-10, 3=10-11, 4=11-12, [lunch], 5=1-2, 6=2-3, 7=3-4, 8=4-5, 9=5-6, 10=6-7, 11=7-8, 12=8-9
    const allowedStarts = [
      {
        slotId: 1,
        time: '8AM',
        endTime: '5PM',
        fullTimeSlots: [1, 2, 3, 4, 5, 6, 7, 8],  // 8AM-12PM (4h), [lunch], 1PM-5PM (4h) = 8 hours
        partTimeSlots: [1, 2, 3, 4]  // 8AM-12PM = 4 hours
      },
      {
        slotId: 3,
        time: '10AM',
        endTime: '7PM',
        fullTimeSlots: [3, 4, 5, 6, 7, 8, 9, 10],  // 10AM-12PM (2h), [lunch], 1PM-7PM (6h) = 8 hours
        partTimeSlots: [3, 4, 5, 6]  // 10AM-12PM, 1PM-2PM = 4 hours
      },
      {
        slotId: 5,
        time: '1PM',
        endTime: '9PM',
        fullTimeSlots: [5, 6, 7, 8, 9, 10, 11, 12],  // 1PM-9PM = 8 hours (no lunch break)
        partTimeSlots: [5, 6, 7, 8]  // 1PM-5PM = 4 hours
      },
      {
        slotId: 7,
        time: '3PM',
        endTime: '7PM',
        fullTimeSlots: [],  // Would need slots 7-14 for 8 hours, but only have up to 12 (6 hours available)
        partTimeSlots: [7, 8, 9, 10]  // 3PM-7PM = 4 hours
      },
      {
        slotId: 9,
        time: '5PM',
        endTime: '9PM',
        fullTimeSlots: [],  // Would need slots 9-16 for 8 hours, but only have up to 12 (4 hours available)
        partTimeSlots: [9, 10, 11, 12]  // 5PM-9PM = 4 hours
      },
    ];

    const recommendations = [];

    // Helper function to score a shift based on how well it covers actual needs
    const scoreShift = (slots, type) => {
      // Calculate total needs that would be covered
      const totalNeedsCovered = slots.reduce((sum, slotId) => {
        return sum + Math.max(0, needs[slotId] || 0);
      }, 0);

      // Calculate wasted coverage (slots with 0 need)
      const slotsWithNeed = slots.filter(slotId => (needs[slotId] || 0) > 0).length;
      const efficiency = slotsWithNeed / slots.length; // 0 to 1

      // Calculate coverage score
      let score = totalNeedsCovered * 100; // Base score on needs covered

      // Efficiency bonus: prefer shifts that don't waste coverage
      score += efficiency * 50; // Up to 50 bonus points for 100% efficiency

      // Full-time bonus: prefer full-time when efficiency is good (>= 60%)
      // This encourages hiring fewer full-time staff instead of many part-time
      if (type === 'Full-time' && efficiency >= 0.6) {
        score += 30; // Bonus for efficient full-time hire
      }

      // Penalty for very inefficient full-time (< 40% efficiency)
      if (type === 'Full-time' && efficiency < 0.4) {
        score -= 50; // Strong penalty to avoid wasteful full-time hires
      }

      return { score, totalNeedsCovered, efficiency };
    };

    // Intelligent optimization: Keep placing the BEST shift until all needs are met
    while (Object.values(needs).some(n => n > 0)) {
      let bestShift = null;
      let bestScore = -1;
      let bestMetrics = null;

      // Evaluate ALL possible shifts and pick the best one
      for (const start of allowedStarts) {
        // Evaluate full-time option
        if (start.fullTimeSlots.length > 0) {
          const metrics = scoreShift(start.fullTimeSlots, 'Full-time');
          if (metrics.score > bestScore) {
            bestScore = metrics.score;
            bestMetrics = metrics;
            bestShift = {
              type: 'Full-time',
              shift: `${start.time}-${start.endTime}`,
              slots: [...start.fullTimeSlots],
            };
          }
        }

        // Evaluate part-time option
        if (start.partTimeSlots.length > 0) {
          const endSlotId = start.partTimeSlots[start.partTimeSlots.length - 1];
          const endTime = getSlotStartTime(endSlotId + 1);

          const metrics = scoreShift(start.partTimeSlots, 'Part-time');
          if (metrics.score > bestScore) {
            bestScore = metrics.score;
            bestMetrics = metrics;
            bestShift = {
              type: 'Part-time',
              shift: `${start.time}-${endTime}`,
              slots: [...start.partTimeSlots],
            };
          }
        }
      }

      // If no shift has any value (score <= 0), we're done
      if (bestScore <= 0 || !bestShift || bestMetrics.totalNeedsCovered === 0) {
        break;
      }

      // Place the best shift
      recommendations.push(bestShift);

      // Reduce needs based on coverage
      bestShift.slots.forEach(slotId => {
        if (needs[slotId] > 0) {
          needs[slotId]--;
        }
      });
    }

    // Calculate total teachers needed
    const fullTimeCount = recommendations.filter(r => r.type === 'Full-time').length;
    const partTimeCount = recommendations.filter(r => r.type === 'Part-time').length;

    return {
      recommendations,
      fullTimeCount,
      partTimeCount,
      totalNeeded: fullTimeCount + partTimeCount,
    };
  };

  // Fetch all data
  const { data: timeSlots, refetch: refetchTimeSlots } = useQuery({
    queryKey: ['timeSlots'],
    queryFn: async () => {
      const response = await getTimeSlots();
      return response.data;
    },
    refetchOnMount: 'always',
  });

  const { data: teachers, refetch: refetchTeachers } = useQuery({
    queryKey: ['teachers', selectedDate],
    queryFn: async () => {
      const response = await getTeachers(selectedDate);
      return response.data;
    },
    enabled: !!selectedDate,
    refetchOnMount: 'always',
  });

  const { data: students, refetch: refetchStudents } = useQuery({
    queryKey: ['students', selectedDate],
    queryFn: async () => {
      const response = await getStudents(selectedDate);
      return response.data;
    },
    enabled: !!selectedDate,
    refetchOnMount: 'always',
  });

  const { data: assignments, refetch: refetchAssignments } = useQuery({
    queryKey: ['assignments', selectedDate],
    queryFn: async () => {
      const response = await getAssignments(selectedDate);
      return response.data;
    },
    refetchOnMount: 'always',
  });

  const handleRefresh = () => {
    refetchTimeSlots();
    refetchTeachers();
    refetchStudents();
    refetchAssignments();
  };

  // Calculate stats for each time slot
  const calculateStats = (timeSlotId) => {
    if (!teachers || !students || !assignments) {
      return {
        availableTeachers: 0,
        studentsWithoutTeachers: 0,
        teachersTeaching: 0,
        studentsPaired: 0,
        hiringNeed: 0,
      };
    }

    // Get assignments for this time slot
    const slotAssignments = assignments.filter((a) => a.time_slot_id === timeSlotId);

    // Get all teachers and students assigned in this time slot
    const assignedTeacherIds = new Set();
    const assignedStudentIds = new Set();

    slotAssignments.forEach((assignment) => {
      assignment.teachers?.forEach((t) => assignedTeacherIds.add(t.id));
      assignment.students?.forEach((s) => assignedStudentIds.add(s.id));
    });

    // Create maps of active teachers and students by ID
    const activeTeachersMap = new Map(teachers.map((t) => [t.id, t]));
    const activeStudentsMap = new Map(students.map((s) => [s.id, s]));

    // Teachers with availability for this slot
    const teachersWithAvailability = teachers.filter((t) =>
      t.availability.includes(timeSlotId)
    );

    // Students with availability for this slot
    const studentsWithAvailability = students.filter((s) =>
      s.availability.includes(timeSlotId)
    );

    // Available teachers = teachers with availability who are NOT teaching
    const availableTeachers = teachersWithAvailability.filter(
      (t) => !assignedTeacherIds.has(t.id)
    ).length;

    // Teachers actually teaching = assigned teachers who STILL EXIST and have availability
    const teachersTeaching = Array.from(assignedTeacherIds).filter((teacherId) => {
      const teacher = activeTeachersMap.get(teacherId);
      return teacher && teacher.availability.includes(timeSlotId);
    }).length;

    // Students paired with valid teachers
    const studentsPairedWithValidTeachers = new Set();

    slotAssignments.forEach((assignment) => {
      // Check if this assignment has at least one valid teacher
      const hasValidTeacher = assignment.teachers?.some((t) => {
        const teacher = activeTeachersMap.get(t.id);
        return teacher && teacher.availability.includes(timeSlotId);
      });

      // If yes, count all students in this assignment as paired
      if (hasValidTeacher) {
        assignment.students?.forEach((s) => studentsPairedWithValidTeachers.add(s.id));
      }
    });

    // Students without teachers = students with availability who either:
    // 1. Are not assigned to any room, OR
    // 2. Are assigned but their teachers are all deleted/unavailable
    const studentsWithoutTeachers = studentsWithAvailability.filter((student) => {
      return !studentsPairedWithValidTeachers.has(student.id);
    }).length;

    // Students already paired (with valid teachers)
    const studentsPaired = studentsPairedWithValidTeachers.size;

    // Buffer: 4 for peak hours (8AM-3PM), 1 for evening (5PM-7PM)
    const timeSlot = timeSlots?.find((ts) => ts.id === timeSlotId);
    if (!timeSlot) {
      // Time slot was deleted - return empty stats
      return {
        availableTeachers: 0,
        studentsWithoutTeachers: 0,
        teachersTeaching: 0,
        studentsPaired: 0,
        hiringNeed: 0,
        buffer: 0,
      };
    }
    const hour = parseInt(timeSlot.start_time.split(':')[0]);
    const buffer = hour >= 17 ? 1 : 4; // 17:00 = 5PM

    // Hiring Need = Students Without Teachers - Available Teachers + Buffer
    const hiringNeed = studentsWithoutTeachers - availableTeachers + buffer;

    return {
      availableTeachers,
      studentsWithoutTeachers,
      teachersTeaching,
      studentsPaired,
      hiringNeed,
      buffer,
    };
  };

  if (!timeSlots || !teachers || !students || !assignments) {
    return <div className="text-center py-8">Loading...</div>;
  }

  // Get hiring optimization results
  const hiringOptimization = optimizeHiring();
  const startDate = calculateStartDate(selectedDate);

  return (
    <div className="space-y-6">
      {/* NEW SECTION: Calendar Prediction View */}
      <CalendarPredictionView selectedDate={selectedDate} />

      {/* Divider */}
      <div className="border-t-4 border-gray-300 my-8"></div>

      {/* EXISTING CONTENT BELOW - UNCHANGED */}
      {/* Hiring Summary Report */}
      {hiringOptimization.totalNeeded > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl shadow-lg p-6 border-2 border-red-200">
          <h2 className="text-2xl font-bold text-red-800 mb-4">🚨 Hiring Recommendation</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg p-4 shadow">
              <div className="text-sm text-gray-600 mb-1">Selected Date</div>
              <div className="text-xl font-bold text-gray-900">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow">
              <div className="text-sm text-gray-600 mb-1">New Hires Must Start By</div>
              <div className="text-xl font-bold text-red-600">
                {startDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </div>
              <div className="text-xs text-gray-500 mt-1">(10 working days before)</div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow">
              <div className="text-sm text-gray-600 mb-1">Total Teachers Needed</div>
              <div className="text-3xl font-bold text-red-600">
                {hiringOptimization.totalNeeded}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {hiringOptimization.fullTimeCount} full-time, {hiringOptimization.partTimeCount} part-time
              </div>
            </div>
          </div>

          {/* Recommended Hires */}
          <div className="bg-white rounded-lg p-4 shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Recommended Hires:</h3>
            <div className="space-y-2">
              {hiringOptimization.recommendations.map((rec, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      rec.type === 'Full-time'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {rec.type}
                    </span>
                    <span className="font-medium text-gray-900">{rec.shift}</span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {rec.type === 'Full-time' ? '8 hours' : '4 hours'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* No Hiring Needed Message */}
      {hiringOptimization.totalNeeded === 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl shadow-lg p-6 border-2 border-green-200">
          <h2 className="text-2xl font-bold text-green-800 mb-2">✅ All Staffed!</h2>
          <p className="text-green-700">No additional teachers needed for this date. All time slots are adequately staffed.</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Hiring Dashboard</h2>
          <button
            onClick={handleRefresh}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-semibold shadow-md hover:shadow-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Stats Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 border-b-2 border-gray-300">
              <tr>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-900 border-r border-gray-200 w-32">
                  Time Slot
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-900 border-r border-gray-200 w-24">
                  Available<br />Teachers
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-900 border-r border-gray-200 w-24">
                  Teachers<br />Teaching
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-900 border-r border-gray-200 w-32">
                  Students<br />Without Teachers
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-900 border-r border-gray-200 w-32">
                  Students<br />Already Paired
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-900 border-r border-gray-200 w-20">
                  Buffer
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-900 w-32">
                  Hiring Need
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {timeSlots.map((slot, index) => {
                const stats = calculateStats(slot.id);
                // Determine background color based on position (alternating pairs)
                const bgColor = Math.floor(index / 2) % 2 === 0 ? 'bg-blue-50' : 'bg-gray-50';

                return (
                  <tr key={slot.id} className={`hover:bg-gray-100 ${bgColor}`}>
                    <td className="px-3 py-2 text-center text-sm font-medium text-gray-900 border-r border-gray-200">
                      {slot.name.replace(' to ', '-')}
                    </td>
                    <td className="px-3 py-2 text-center text-base font-semibold text-blue-600 border-r border-gray-200">
                      {stats.availableTeachers}
                    </td>
                    <td className="px-3 py-2 text-center text-base font-semibold text-green-600 border-r border-gray-200">
                      {stats.teachersTeaching}
                    </td>
                    <td className="px-3 py-2 text-center text-base font-semibold text-orange-600 border-r border-gray-200">
                      {stats.studentsWithoutTeachers}
                    </td>
                    <td className="px-3 py-2 text-center text-base font-semibold text-green-600 border-r border-gray-200">
                      {stats.studentsPaired}
                    </td>
                    <td className="px-3 py-2 text-center text-sm text-gray-600 border-r border-gray-200">
                      +{stats.buffer}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {stats.hiringNeed > 0 ? (
                        <span className="text-base font-bold text-red-600">
                          {stats.hiringNeed}
                        </span>
                      ) : stats.hiringNeed < 0 ? (
                        <span className="text-base font-bold text-green-600">
                          Surplus: {Math.abs(stats.hiringNeed)}
                        </span>
                      ) : (
                        <span className="text-base font-bold text-gray-600">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Legend:</h3>
          <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
            <div>
              <span className="font-semibold text-blue-600">Available Teachers:</span> Teachers with availability who are NOT teaching anyone yet
            </div>
            <div>
              <span className="font-semibold text-green-600">Teachers Teaching:</span> Teachers currently paired with students
            </div>
            <div>
              <span className="font-semibold text-orange-600">Students Without Teachers:</span> Students with availability who are NOT paired yet
            </div>
            <div>
              <span className="font-semibold text-green-600">Students Already Paired:</span> Students currently paired with teachers
            </div>
            <div>
              <span className="font-semibold text-gray-600">Buffer:</span> Extra teachers to maintain (4 for peak hours, 1 for evening)
            </div>
            <div>
              <span className="font-semibold text-red-600">Hiring Need:</span> Extra teachers needed (Students Without - Available + Buffer)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HiringPage;
