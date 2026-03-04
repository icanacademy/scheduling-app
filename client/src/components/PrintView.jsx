import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTimeSlots, getRooms, getAssignments, getTeachers, getStudents } from '../services/api';

function PrintView({ selectedDate }) {
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [groupBy, setGroupBy] = useState('room'); // 'room', 'timeslot', or 'teacher'

  // Fetch time slots
  const { data: timeSlots } = useQuery({
    queryKey: ['timeSlots'],
    queryFn: async () => {
      const response = await getTimeSlots();
      return response.data;
    },
  });

  // Fetch rooms
  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      const response = await getRooms();
      return response.data;
    },
  });

  // Fetch assignments
  const { data: assignments } = useQuery({
    queryKey: ['assignments', selectedDate],
    queryFn: async () => {
      const response = await getAssignments(selectedDate);
      return response.data;
    },
    enabled: !!selectedDate,
  });

  // Fetch teachers
  const { data: teachers } = useQuery({
    queryKey: ['teachers', selectedDate],
    queryFn: async () => {
      const response = await getTeachers(selectedDate);
      return response.data;
    },
    enabled: !!selectedDate,
  });

  // Fetch students
  const { data: students } = useQuery({
    queryKey: ['students', selectedDate],
    queryFn: async () => {
      const response = await getStudents(selectedDate);
      return response.data;
    },
    enabled: !!selectedDate,
  });

  // Handle time slot selection
  const handleSlotToggle = (slotId) => {
    setSelectedSlots((prev) => {
      if (prev.includes(slotId)) {
        return prev.filter((id) => id !== slotId);
      } else {
        return [...prev, slotId].sort((a, b) => a - b);
      }
    });
  };

  // Get assignments for selected slots grouped by room
  const printData = useMemo(() => {
    if (!assignments || !rooms || !timeSlots || selectedSlots.length === 0) {
      return [];
    }

    const roomData = [];

    // Helper function to check if two teacher arrays are identical
    const areTeachersEqual = (teachers1, teachers2) => {
      if (teachers1.length !== teachers2.length) return false;
      const ids1 = teachers1.map((t) => t.id).sort();
      const ids2 = teachers2.map((t) => t.id).sort();
      return ids1.every((id, idx) => id === ids2[idx]);
    };

    // Helper function to check if two student arrays are identical
    const areStudentsEqual = (students1, students2) => {
      if (students1.length !== students2.length) return false;
      const ids1 = students1.map((s) => s.id).sort();
      const ids2 = students2.map((s) => s.id).sort();
      return ids1.every((id, idx) => id === ids2[idx]);
    };

    rooms.forEach((room) => {
      // Get all assignments for this room in the selected time slots
      const roomAssignments = assignments.filter(
        (a) => a.room_id === room.id && selectedSlots.includes(a.time_slot_id)
      );

      if (roomAssignments.length === 0) {
        return; // Skip empty rooms
      }

      // Group assignments by time slot
      const slotGroups = [];
      selectedSlots.forEach((slotId) => {
        const slotAssignment = roomAssignments.find((a) => a.time_slot_id === slotId);
        const slotInfo = timeSlots.find((ts) => ts.id === slotId);

        slotGroups.push({
          slotId: slotId,
          slotName: slotInfo?.name || `Slot ${slotId}`,
          teachers: slotAssignment?.teachers || [],
          students: slotAssignment?.students || [],
        });
      });

      // Merge consecutive slots with identical teachers/students
      const mergedGroups = [];
      let currentGroup = [slotGroups[0]];

      for (let i = 1; i < slotGroups.length; i++) {
        const prevSlot = slotGroups[i - 1];
        const currSlot = slotGroups[i];

        const areConsecutive = currSlot.slotId === prevSlot.slotId + 1;
        const sameTeachers = areTeachersEqual(prevSlot.teachers, currSlot.teachers);
        const sameStudents = areStudentsEqual(prevSlot.students, currSlot.students);

        if (areConsecutive && sameTeachers && sameStudents) {
          // Add to current group
          currentGroup.push(currSlot);
        } else {
          // Finish current group and start new one
          mergedGroups.push(currentGroup);
          currentGroup = [currSlot];
        }
      }
      // Don't forget the last group
      mergedGroups.push(currentGroup);

      // Create final slot groups with merged time ranges
      const finalSlotGroups = mergedGroups.map((group) => {
        if (group.length === 1) {
          // Single slot, no merging needed
          return {
            slotName: group[0].slotName,
            teachers: group[0].teachers,
            students: group[0].students,
          };
        } else {
          // Multiple slots, merge time range
          const startTime = group[0].slotName.split(' to ')[0];
          const endTime = group[group.length - 1].slotName.split(' to ')[1];
          return {
            slotName: `${startTime} to ${endTime}`,
            teachers: group[0].teachers,
            students: group[0].students,
          };
        }
      });

      // Skip rooms where ALL slot groups have neither teachers nor students
      const hasContent = finalSlotGroups.some(
        (group) => group.teachers.length > 0 || group.students.length > 0
      );

      if (!hasContent) {
        return; // Skip rooms with no content
      }

      roomData.push({
        room: room.name,
        slotGroups: finalSlotGroups,
      });
    });

    return roomData;
  }, [assignments, rooms, timeSlots, selectedSlots]);

  // Get assignments grouped by time slot (with merging)
  const printDataByTimeSlot = useMemo(() => {
    if (!assignments || !rooms || !timeSlots || selectedSlots.length === 0) {
      return [];
    }

    // Helper function to check if two teacher arrays are identical
    const areTeachersEqual = (teachers1, teachers2) => {
      if (teachers1.length !== teachers2.length) return false;
      const ids1 = teachers1.map((t) => t.id).sort();
      const ids2 = teachers2.map((t) => t.id).sort();
      return ids1.every((id, idx) => id === ids2[idx]);
    };

    // Helper function to check if two student arrays are identical
    const areStudentsEqual = (students1, students2) => {
      if (students1.length !== students2.length) return false;
      const ids1 = students1.map((s) => s.id).sort();
      const ids2 = students2.map((s) => s.id).sort();
      return ids1.every((id, idx) => id === ids2[idx]);
    };

    // First, collect all room assignments across all selected time slots
    const roomTimeSlotMap = new Map(); // Map<roomId, Array<{slotId, slotName, teachers, students}>>

    rooms.forEach((room) => {
      const roomSlots = [];

      selectedSlots.forEach((slotId) => {
        const slotInfo = timeSlots.find((ts) => ts.id === slotId);
        const assignment = assignments.find((a) => a.room_id === room.id && a.time_slot_id === slotId);

        if (assignment && (assignment.teachers?.length > 0 || assignment.students?.length > 0)) {
          roomSlots.push({
            slotId: slotId,
            slotName: slotInfo?.name || `Slot ${slotId}`,
            teachers: assignment.teachers || [],
            students: assignment.students || [],
          });
        }
      });

      if (roomSlots.length > 0) {
        roomTimeSlotMap.set(room.id, { roomName: room.name, slots: roomSlots });
      }
    });

    // Now merge consecutive time slots for each room
    const mergedData = [];

    roomTimeSlotMap.forEach(({ roomName, slots }) => {
      // Merge consecutive slots with identical teachers/students
      const mergedGroups = [];
      let currentGroup = [slots[0]];

      for (let i = 1; i < slots.length; i++) {
        const prevSlot = slots[i - 1];
        const currSlot = slots[i];

        const areConsecutive = currSlot.slotId === prevSlot.slotId + 1;
        const sameTeachers = areTeachersEqual(prevSlot.teachers, currSlot.teachers);
        const sameStudents = areStudentsEqual(prevSlot.students, currSlot.students);

        if (areConsecutive && sameTeachers && sameStudents) {
          // Add to current group
          currentGroup.push(currSlot);
        } else {
          // Finish current group and start new one
          mergedGroups.push(currentGroup);
          currentGroup = [currSlot];
        }
      }
      // Don't forget the last group
      mergedGroups.push(currentGroup);

      // Create final merged time ranges
      mergedGroups.forEach((group) => {
        let slotName;
        if (group.length === 1) {
          slotName = group[0].slotName;
        } else {
          const startTime = group[0].slotName.split(' to ')[0];
          const endTime = group[group.length - 1].slotName.split(' to ')[1];
          slotName = `${startTime} to ${endTime}`;
        }

        mergedData.push({
          slotName: slotName,
          startSlotId: group[0].slotId, // Track the starting slot ID for sorting
          room: roomName,
          teachers: group[0].teachers,
          students: group[0].students,
        });
      });
    });

    // Group by time slot name for display
    const timeSlotGroups = new Map();
    mergedData.forEach((item) => {
      if (!timeSlotGroups.has(item.slotName)) {
        timeSlotGroups.set(item.slotName, {
          startSlotId: item.startSlotId,
          roomAssignments: [],
        });
      }
      timeSlotGroups.get(item.slotName).roomAssignments.push({
        room: item.room,
        teachers: item.teachers,
        students: item.students,
      });
    });

    // Convert to array format and sort by start time
    return Array.from(timeSlotGroups.entries())
      .map(([slotName, data]) => ({
        slotName,
        startSlotId: data.startSlotId,
        roomAssignments: data.roomAssignments,
      }))
      .sort((a, b) => a.startSlotId - b.startSlotId);
  }, [assignments, rooms, timeSlots, selectedSlots]);

  // Get assignments grouped by teacher
  const printDataByTeacher = useMemo(() => {
    if (!assignments || !rooms || !timeSlots || selectedSlots.length === 0) {
      return [];
    }

    // Helper function to check if two student arrays are identical
    const areStudentsEqual = (students1, students2) => {
      if (students1.length !== students2.length) return false;
      const ids1 = students1.map((s) => s.id).sort();
      const ids2 = students2.map((s) => s.id).sort();
      return ids1.every((id, idx) => id === ids2[idx]);
    };

    const teacherMap = new Map();

    // Collect all assignments for selected time slots
    const selectedAssignments = assignments.filter((a) => selectedSlots.includes(a.time_slot_id));

    selectedAssignments.forEach((assignment) => {
      const roomInfo = rooms.find((r) => r.id === assignment.room_id);
      const slotInfo = timeSlots.find((ts) => ts.id === assignment.time_slot_id);

      if (assignment.teachers && assignment.teachers.length > 0) {
        assignment.teachers.forEach((teacher) => {
          if (!teacherMap.has(teacher.id)) {
            teacherMap.set(teacher.id, {
              teacherName: teacher.name,
              isSubstitute: teacher.is_substitute,
              assignments: [],
            });
          }

          teacherMap.get(teacher.id).assignments.push({
            slotName: slotInfo?.name || `Slot ${assignment.time_slot_id}`,
            slotId: assignment.time_slot_id,
            room: roomInfo?.name || assignment.room_id,
            students: assignment.students || [],
          });
        });
      }
    });

    // Convert map to array, sort assignments by time slot, and merge consecutive slots
    return Array.from(teacherMap.values()).map((teacherData) => {
      // Sort assignments by time slot
      const sortedAssignments = teacherData.assignments.sort((a, b) => a.slotId - b.slotId);

      // Merge consecutive slots with same room and students
      if (sortedAssignments.length === 0) {
        return { ...teacherData, assignments: [] };
      }

      const mergedGroups = [];
      let currentGroup = [sortedAssignments[0]];

      for (let i = 1; i < sortedAssignments.length; i++) {
        const prevAssignment = sortedAssignments[i - 1];
        const currAssignment = sortedAssignments[i];

        const areConsecutive = currAssignment.slotId === prevAssignment.slotId + 1;
        const sameRoom = prevAssignment.room === currAssignment.room;
        const sameStudents = areStudentsEqual(prevAssignment.students, currAssignment.students);

        if (areConsecutive && sameRoom && sameStudents) {
          // Add to current group
          currentGroup.push(currAssignment);
        } else {
          // Finish current group and start new one
          mergedGroups.push(currentGroup);
          currentGroup = [currAssignment];
        }
      }
      // Don't forget the last group
      mergedGroups.push(currentGroup);

      // Create final assignments with merged time ranges
      const finalAssignments = mergedGroups.map((group) => {
        if (group.length === 1) {
          // Single slot, no merging needed
          return {
            slotName: group[0].slotName,
            room: group[0].room,
            students: group[0].students,
          };
        } else {
          // Multiple slots, merge time range
          const startTime = group[0].slotName.split(' to ')[0];
          const endTime = group[group.length - 1].slotName.split(' to ')[1];
          return {
            slotName: `${startTime} to ${endTime}`,
            room: group[0].room,
            students: group[0].students,
          };
        }
      });

      return {
        ...teacherData,
        assignments: finalAssignments,
      };
    }).sort((a, b) => a.teacherName.localeCompare(b.teacherName));
  }, [assignments, rooms, timeSlots, selectedSlots]);

  // Get selected time slot names (with smart merging)
  const selectedTimeSlotNames = useMemo(() => {
    if (!timeSlots || selectedSlots.length === 0) return '';

    // Sort selected slots
    const sortedSlots = [...selectedSlots].sort((a, b) => a - b);

    // Group consecutive slots
    const groups = [];
    let currentGroup = [sortedSlots[0]];

    for (let i = 1; i < sortedSlots.length; i++) {
      if (sortedSlots[i] === sortedSlots[i - 1] + 1) {
        // Consecutive, add to current group
        currentGroup.push(sortedSlots[i]);
      } else {
        // Not consecutive, finish current group and start new one
        groups.push(currentGroup);
        currentGroup = [sortedSlots[i]];
      }
    }
    // Don't forget the last group
    groups.push(currentGroup);

    // Create merged time ranges
    const mergedRanges = groups.map((group) => {
      if (group.length === 1) {
        // Single slot, show as is
        return timeSlots.find((ts) => ts.id === group[0])?.name;
      } else {
        // Multiple consecutive slots, merge into range
        const firstSlot = timeSlots.find((ts) => ts.id === group[0]);
        const lastSlot = timeSlots.find((ts) => ts.id === group[group.length - 1]);

        if (firstSlot && lastSlot) {
          const startTime = firstSlot.name.split(' to ')[0];
          const endTime = lastSlot.name.split(' to ')[1];
          return `${startTime} to ${endTime}`;
        }
        return '';
      }
    }).filter(Boolean);

    return mergedRanges.join(', ');
  }, [timeSlots, selectedSlots]);

  const handlePrint = () => {
    window.print();
  };

  if (!selectedDate) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Please select a date first</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls - hidden when printing */}
      <div className="bg-white rounded-xl shadow-lg p-6 print:hidden">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Print View</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2">
              Select Time Slots (consecutive slots with same data will be merged)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {timeSlots?.map((slot) => (
                <button
                  key={slot.id}
                  onClick={() => handleSlotToggle(slot.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedSlots.includes(slot.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {slot.name.replace(' to ', '-')}
                </button>
              ))}
            </div>
          </div>

          {/* Group by toggle */}
          <div>
            <label className="block text-sm font-semibold mb-2">Group By</label>
            <div className="flex gap-2">
              <button
                onClick={() => setGroupBy('room')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  groupBy === 'room'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Room
              </button>
              <button
                onClick={() => setGroupBy('timeslot')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  groupBy === 'timeslot'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Time Slot
              </button>
              <button
                onClick={() => setGroupBy('teacher')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  groupBy === 'teacher'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Teacher
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handlePrint}
              disabled={selectedSlots.length === 0}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md hover:shadow-lg transition-all"
            >
              Print Schedule
            </button>
            <button
              onClick={() => setSelectedSlots([])}
              disabled={selectedSlots.length === 0}
              className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md hover:shadow-lg transition-all"
            >
              Clear Selection
            </button>
          </div>
        </div>
      </div>

      {/* Print Content */}
      {selectedSlots.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg p-8 print:shadow-none print:p-4">
          {/* Header - shows when printing */}
          <div className="mb-6 print:mb-4">
            <h1 className="text-3xl font-bold text-gray-900 print:text-2xl">
              Class Schedule
            </h1>
            <div className="text-lg text-gray-600 mt-2 print:text-base">
              <div>
                <strong>Date:</strong>{' '}
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
              <div>
                <strong>Time:</strong> {selectedTimeSlotNames}
              </div>
            </div>
          </div>

          {/* Schedule Content */}
          <div className="space-y-6 print:space-y-4">
            {groupBy === 'room' ? (
              // Group by Room
              printData.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No assignments for the selected time slot(s)
                </div>
              ) : (
                printData.map((roomData, index) => (
                  <div
                    key={index}
                    className="border-l-4 border-blue-600 pl-4 py-2 print:break-inside-avoid"
                  >
                    <h3 className="text-xl font-bold text-gray-900 mb-3 print:text-lg">
                      Room {roomData.room}
                    </h3>

                    <div className="space-y-1">
                      {roomData.slotGroups.map((slotGroup, slotIndex) => {
                        const teachersText = slotGroup.teachers.length > 0
                          ? slotGroup.teachers
                              .map((t) => `${t.name}${t.is_substitute ? ' (SUB)' : ''}`)
                              .join(', ')
                          : 'None';

                        const studentsText = slotGroup.students.length > 0
                          ? slotGroup.students
                              .map((s) => s.name)
                              .join(', ')
                          : 'None';

                        return (
                          <div key={slotIndex} className="text-sm">
                            <span className="font-semibold text-gray-900">{slotGroup.slotName}:</span>
                            {' '}
                            <span className="text-gray-700">Teacher/s: {teachersText}</span>
                            {' - '}
                            <span className="text-gray-700">Student/s: {studentsText}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )
            ) : groupBy === 'timeslot' ? (
              // Group by Time Slot
              printDataByTimeSlot.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No assignments for the selected time slot(s)
                </div>
              ) : (
                printDataByTimeSlot.map((slotData, index) => (
                  <div
                    key={index}
                    className="border-l-4 border-green-600 pl-4 py-2 print:break-inside-avoid"
                  >
                    <h3 className="text-xl font-bold text-gray-900 mb-3 print:text-lg">
                      {slotData.slotName}
                    </h3>

                    <div className="space-y-1">
                      {slotData.roomAssignments.map((roomAssignment, roomIndex) => {
                        const teachersText = roomAssignment.teachers.length > 0
                          ? roomAssignment.teachers
                              .map((t) => `${t.name}${t.is_substitute ? ' (SUB)' : ''}`)
                              .join(', ')
                          : 'None';

                        const studentsText = roomAssignment.students.length > 0
                          ? roomAssignment.students
                              .map((s) => s.name)
                              .join(', ')
                          : 'None';

                        return (
                          <div key={roomIndex} className="text-sm">
                            <span className="font-semibold text-gray-900">Room {roomAssignment.room}:</span>
                            {' '}
                            <span className="text-gray-700">Teacher/s: {teachersText}</span>
                            {' - '}
                            <span className="text-gray-700">Student/s: {studentsText}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )
            ) : (
              // Group by Teacher
              printDataByTeacher.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No assignments for the selected time slot(s)
                </div>
              ) : (
                printDataByTeacher.map((teacherData, index) => (
                  <div
                    key={index}
                    className="border-l-4 border-purple-600 pl-4 py-2 print:break-inside-avoid"
                  >
                    <h3 className="text-xl font-bold text-gray-900 mb-3 print:text-lg">
                      {teacherData.teacherName}{teacherData.isSubstitute ? ' (SUB)' : ''}
                    </h3>

                    <div className="space-y-1">
                      {teacherData.assignments.map((assignment, assignmentIndex) => {
                        const studentsText = assignment.students.length > 0
                          ? assignment.students
                              .map((s) => s.name)
                              .join(', ')
                          : 'None';

                        return (
                          <div key={assignmentIndex} className="text-sm">
                            <span className="font-semibold text-gray-900">{assignment.slotName}:</span>
                            {' '}
                            <span className="text-gray-700">Room {assignment.room}</span>
                            {' - '}
                            <span className="text-gray-700">Student/s: {studentsText}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-200 text-sm text-gray-500 print:mt-6">
            {groupBy === 'room'
              ? `Total Rooms: ${printData.length}`
              : groupBy === 'timeslot'
              ? `Total Time Slots: ${printDataByTimeSlot.length}`
              : `Total Teachers: ${printDataByTeacher.length}`
            }
          </div>
        </div>
      )}
    </div>
  );
}

export default PrintView;
