import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTeachers, getStudents } from '../services/api';
import RoomCell from './RoomCell';
import AssignmentModal from './AssignmentModal';

function SchedulingGrid({ timeSlots, rooms, assignments, selectedDate, onRefetch }) {
  const [selectedCell, setSelectedCell] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch teachers and students for availability checking
  const { data: teachers } = useQuery({
    queryKey: ['teachers', selectedDate],
    queryFn: async () => {
      const response = await getTeachers(selectedDate);
      return response.data;
    },
    enabled: !!selectedDate,
  });

  const { data: students } = useQuery({
    queryKey: ['students', selectedDate],
    queryFn: async () => {
      const response = await getStudents(selectedDate);
      return response.data;
    },
    enabled: !!selectedDate,
  });

  // Create a map of assignments by time_slot_id and room_id for quick lookup
  const assignmentMap = useMemo(() => {
    const map = {};
    assignments.forEach((assignment) => {
      const key = `${assignment.time_slot_id}-${assignment.room_id}`;
      map[key] = assignment;
    });
    return map;
  }, [assignments]);

  const handleCellClick = (timeSlotId, roomId) => {
    const key = `${timeSlotId}-${roomId}`;
    const existingAssignment = assignmentMap[key];

    setSelectedCell({
      timeSlotId,
      roomId,
      assignment: existingAssignment || null,
    });
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedCell(null);
  };

  const handleSave = () => {
    onRefetch();
    handleModalClose();
  };

  // Helper function to get column background color
  const getColumnBgColor = (index) => {
    // Alternate between blue and gray for each pair of time slots
    return Math.floor(index / 2) % 2 === 0 ? 'bg-blue-50' : 'bg-gray-100';
  };

  // Calculate incomplete assignments for each time slot
  const calculateIncompleteAssignments = (timeSlotId) => {
    if (!teachers || !students) {
      return { teachersNoStudents: 0, studentsNoTeachers: 0 };
    }

    // Get all assignments for this time slot
    const slotAssignments = assignments.filter((a) => a.time_slot_id === timeSlotId);

    // Get all teacher and student IDs that are properly paired
    const teachersWithStudents = new Set();
    const studentsWithTeachers = new Set();

    slotAssignments.forEach((assignment) => {
      const hasValidTeachers = assignment.teachers && assignment.teachers.length > 0;
      const hasValidStudents = assignment.students && assignment.students.length > 0;

      // Only count as properly paired if BOTH teachers AND students are present
      if (hasValidTeachers && hasValidStudents) {
        assignment.teachers.forEach((t) => teachersWithStudents.add(t.id));
        assignment.students.forEach((s) => studentsWithTeachers.add(s.id));
      }
    });

    // Get teachers with availability for this time slot who are NOT properly paired
    const teachersNoStudents = teachers.filter(
      (t) => t.availability.includes(timeSlotId) && !teachersWithStudents.has(t.id)
    ).length;

    // Get students with availability for this time slot who are NOT properly paired
    const studentsNoTeachers = students.filter(
      (s) => s.availability.includes(timeSlotId) && !studentsWithTeachers.has(s.id)
    ).length;

    return { teachersNoStudents, studentsNoTeachers };
  };

  return (
    <>
      <div className="overflow-x-auto max-h-[calc(100vh-300px)] overflow-y-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="border-l border-r border-t border-gray-300 px-2 pt-2 pb-1 text-left font-semibold text-sm sticky left-0 top-0 bg-gray-200 z-20">
                Room
              </th>
              {timeSlots.map((slot, index) => {
                const bgColor = Math.floor(index / 2) % 2 === 0 ? 'bg-gray-200' : 'bg-gray-300';

                return (
                  <th
                    key={slot.id}
                    className={`border-l border-r border-t border-gray-300 px-2 pt-2 pb-1 text-center font-semibold text-sm min-w-[120px] sticky top-0 z-10 ${bgColor}`}
                  >
                    {slot.name}
                  </th>
                );
              })}
            </tr>
            {/* Incomplete assignments summary row - only show if data is loaded */}
            {teachers && students && (
              <tr className="bg-yellow-50 border-t-2 border-gray-400">
                <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold text-gray-700 sticky left-0 bg-yellow-50 z-10">
                  Unpaired
                </th>
                {timeSlots.map((slot, index) => {
                  const stats = calculateIncompleteAssignments(slot.id);
                  const bgColor = getColumnBgColor(index);
                  const hasIssues = stats.teachersNoStudents > 0 || stats.studentsNoTeachers > 0;

                  return (
                    <th
                      key={`incomplete-${slot.id}`}
                      className={`border border-gray-300 px-1 py-2 text-center text-xs ${bgColor}`}
                    >
                      {hasIssues ? (
                        <div className="space-y-1">
                          {stats.teachersNoStudents > 0 && (
                            <div className="text-blue-700 font-bold whitespace-nowrap">
                              {stats.teachersNoStudents} T
                            </div>
                          )}
                          {stats.studentsNoTeachers > 0 && (
                            <div className="text-red-700 font-bold whitespace-nowrap">
                              {stats.studentsNoTeachers} S
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-green-600 font-bold text-base">✓</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <td className="border border-gray-300 p-2 font-semibold text-sm bg-gray-50 sticky left-0 z-10">
                  {room.name}
                </td>
                {timeSlots.map((slot, index) => {
                  const key = `${slot.id}-${room.id}`;
                  const assignment = assignmentMap[key];
                  const bgColor = getColumnBgColor(index);

                  return (
                    <RoomCell
                      key={key}
                      assignment={assignment}
                      timeSlotId={slot.id}
                      teachers={teachers || []}
                      students={students || []}
                      onClick={() => handleCellClick(slot.id, room.id)}
                      columnBgColor={bgColor}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && selectedCell && (
        <AssignmentModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onSave={handleSave}
          selectedDate={selectedDate}
          timeSlotId={selectedCell.timeSlotId}
          roomId={selectedCell.roomId}
          existingAssignment={selectedCell.assignment}
          timeSlots={timeSlots}
          rooms={rooms}
        />
      )}
    </>
  );
}

export default SchedulingGrid;
