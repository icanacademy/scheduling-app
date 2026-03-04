import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getTeachers,
  getStudents,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  validateAssignment,
  getAssignments,
} from '../services/api';

function AssignmentModal({
  isOpen,
  onClose,
  onSave,
  selectedDate,
  timeSlotId,
  roomId,
  existingAssignment,
  timeSlots,
  rooms,
}) {
  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [assignmentType, setAssignmentType] = useState('class');
  const [notes, setNotes] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);
  const [colorFilter, setColorFilter] = useState('');

  // Get the time slot and room names for display
  const timeSlot = timeSlots.find((ts) => ts.id === timeSlotId);
  const room = rooms.find((r) => r.id === roomId);

  // Fetch all teachers
  const { data: teachers } = useQuery({
    queryKey: ['teachers', selectedDate],
    queryFn: async () => {
      const response = await getTeachers(selectedDate);
      return response.data;
    },
    enabled: !!selectedDate,
  });

  // Fetch all students
  const { data: students } = useQuery({
    queryKey: ['students', selectedDate],
    queryFn: async () => {
      const response = await getStudents(selectedDate);
      return response.data;
    },
    enabled: !!selectedDate,
  });

  // Fetch all assignments for this date and time slot
  const { data: allAssignments } = useQuery({
    queryKey: ['assignments', selectedDate],
    queryFn: async () => {
      const response = await getAssignments(selectedDate);
      return response.data;
    },
    enabled: !!selectedDate && isOpen,
  });

  // Build maps of who's assigned where at this time slot
  const { teacherAssignments, studentAssignments } = useMemo(() => {
    const teacherMap = new Map();
    const studentMap = new Map();

    if (!allAssignments) return { teacherAssignments: teacherMap, studentAssignments: studentMap };

    // Filter assignments for this time slot, excluding the current room if editing
    const relevantAssignments = allAssignments.filter(
      (a) => a.time_slot_id === timeSlotId && a.room_id !== roomId
    );

    relevantAssignments.forEach((assignment) => {
      const roomName = rooms.find((r) => r.id === assignment.room_id)?.name || assignment.room_id;

      // Map teachers
      assignment.teachers?.forEach((teacher) => {
        teacherMap.set(teacher.id, roomName);
      });

      // Map students
      assignment.students?.forEach((student) => {
        studentMap.set(student.id, roomName);
      });
    });

    return { teacherAssignments: teacherMap, studentAssignments: studentMap };
  }, [allAssignments, timeSlotId, roomId, rooms]);

  // Get list of all teachers to show - includes available ones + currently selected ones (even if unavailable or deleted)
  const teachersToShow = useMemo(() => {
    if (!teachers) return [];

    const availableTeacherIds = new Set(
      teachers.filter((t) => t.availability.includes(timeSlotId)).map((t) => t.id)
    );

    const selectedTeacherIds = selectedTeachers.map((st) => st.teacher_id);
    const teachersMap = new Map(teachers.map((t) => [t.id, t]));

    // Create list of teachers to show
    const teachersSet = new Map();

    // Add all available teachers
    teachers.forEach((teacher) => {
      if (availableTeacherIds.has(teacher.id)) {
        teachersSet.set(teacher.id, teacher);
      }
    });

    // Add all selected teachers (even if deleted or unavailable)
    selectedTeacherIds.forEach((teacherId) => {
      if (!teachersSet.has(teacherId)) {
        const teacher = teachersMap.get(teacherId);
        if (teacher) {
          // Teacher exists but is unavailable
          teachersSet.set(teacherId, teacher);
        } else {
          // Teacher was deleted - create a placeholder
          teachersSet.set(teacherId, {
            id: teacherId,
            name: `[DELETED TEACHER - ID: ${teacherId}]`,
            availability: [],
            color_keyword: null,
            isDeleted: true,
          });
        }
      }
    });

    return Array.from(teachersSet.values());
  }, [teachers, timeSlotId, selectedTeachers]);

  // Get list of all students to show - includes available ones + currently selected ones (even if unavailable or deleted)
  const studentsToShow = useMemo(() => {
    if (!students) return [];

    const availableStudentIds = new Set(
      students.filter((s) => s.availability.includes(timeSlotId)).map((s) => s.id)
    );

    const selectedStudentIds = selectedStudents.map((ss) => ss.student_id);
    const studentsMap = new Map(students.map((s) => [s.id, s]));

    // Create list of students to show
    const studentsSet = new Map();

    // Add all available students that match the color filter
    students.forEach((student) => {
      if (availableStudentIds.has(student.id)) {
        const matchesColor = !colorFilter || student.color_keyword === colorFilter;
        if (matchesColor) {
          studentsSet.set(student.id, student);
        }
      }
    });

    // Add all selected students (even if deleted or unavailable)
    selectedStudentIds.forEach((studentId) => {
      if (!studentsSet.has(studentId)) {
        const student = studentsMap.get(studentId);
        if (student) {
          // Student exists but is unavailable or doesn't match color filter
          studentsSet.set(studentId, student);
        } else {
          // Student was deleted - create a placeholder
          studentsSet.set(studentId, {
            id: studentId,
            name: `[DELETED STUDENT - ID: ${studentId}]`,
            english_name: null,
            availability: [],
            color_keyword: null,
            weakness_level: null,
            isDeleted: true,
          });
        }
      }
    });

    return Array.from(studentsSet.values());
  }, [students, timeSlotId, selectedStudents, colorFilter]);

  // Initialize form with existing assignment data
  useEffect(() => {
    if (existingAssignment) {
      const teachersList = existingAssignment.teachers?.map((t) => ({
        teacher_id: t.id,
        is_substitute: t.is_substitute || false,
      })) || [];

      const studentsList = existingAssignment.students?.map((s) => ({
        student_id: s.id,
      })) || [];

      setSelectedTeachers(teachersList);
      setSelectedStudents(studentsList);
      setAssignmentType(existingAssignment.assignment_type || 'class');
      setNotes(existingAssignment.notes || '');
    }
  }, [existingAssignment]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: createAssignment,
    onSuccess: () => {
      onSave();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateAssignment(id, data),
    onSuccess: () => {
      onSave();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAssignment,
    onSuccess: () => {
      onSave();
    },
  });

  const handleTeacherToggle = (teacherId) => {
    setSelectedTeachers((prev) => {
      const exists = prev.find((t) => t.teacher_id === teacherId);
      if (exists) {
        return prev.filter((t) => t.teacher_id !== teacherId);
      } else {
        if (prev.length >= 2) {
          alert('Maximum 2 teachers per room');
          return prev;
        }
        return [...prev, { teacher_id: teacherId, is_substitute: false }];
      }
    });
  };

  const handleSubstituteToggle = (teacherId) => {
    setSelectedTeachers((prev) =>
      prev.map((t) =>
        t.teacher_id === teacherId ? { ...t, is_substitute: !t.is_substitute } : t
      )
    );
  };

  const handleAssignmentTypeToggle = (type) => {
    if (assignmentType === type) {
      // Deselect — go back to normal class
      setAssignmentType('class');
    } else {
      // Select ONLINE or TASK — clear students since they're not needed
      setAssignmentType(type);
      setSelectedStudents([]);
    }
  };

  const handleStudentToggle = (studentId) => {
    // If selecting a real student, reset assignment type to class
    if (assignmentType !== 'class') {
      setAssignmentType('class');
    }
    setSelectedStudents((prev) => {
      const exists = prev.find((s) => s.student_id === studentId);
      if (exists) {
        return prev.filter((s) => s.student_id !== studentId);
      } else {
        if (prev.length >= 5) {
          alert('Maximum 5 students per room');
          return prev;
        }
        return [...prev, { student_id: studentId }];
      }
    });
  };

  const handleValidate = async () => {
    try {
      const response = await validateAssignment({
        id: existingAssignment?.id,  // Include assignment ID if updating
        date: selectedDate,
        time_slot_id: timeSlotId,
        room_id: roomId,
        teachers: selectedTeachers,
        students: selectedStudents,
      });

      if (!response.data.valid) {
        setValidationErrors(response.data.errors);
        return false;
      }

      setValidationErrors([]);
      return true;
    } catch (error) {
      console.error('Validation error:', error);
      setValidationErrors(['Failed to validate assignment']);
      return false;
    }
  };

  const handleSave = async () => {
    // Validate first
    const isValid = await handleValidate();
    if (!isValid && validationErrors.length > 0) {
      return;
    }

    const data = {
      date: selectedDate,
      time_slot_id: timeSlotId,
      room_id: roomId,
      teachers: selectedTeachers,
      students: selectedStudents,
      notes,
      assignment_type: assignmentType,
    };

    try {
      if (existingAssignment) {
        await updateMutation.mutateAsync({ id: existingAssignment.id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save assignment');
    }
  };

  const handleDelete = async () => {
    if (existingAssignment && confirm('Are you sure you want to delete this assignment?')) {
      try {
        await deleteMutation.mutateAsync(existingAssignment.id);
      } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to delete assignment');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">
              {existingAssignment ? 'Edit' : 'Create'} Assignment
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              &times;
            </button>
          </div>
          <div className="mt-2 text-sm text-gray-600">
            Room {room?.name} - {timeSlot?.name} ({selectedDate})
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <h3 className="text-sm font-semibold text-red-800 mb-2">Validation Errors:</h3>
              <ul className="list-disc list-inside text-sm text-red-700">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Teachers and Students side by side */}
          <div className="grid grid-cols-2 gap-6">
            {/* Teachers Selection */}
            <div>
              <h3 className="text-lg font-semibold mb-3">
                Teachers (Max 2) - {selectedTeachers.length}/2 selected
              </h3>
              <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto border border-gray-200 rounded p-3">
                {teachersToShow.map((teacher) => {
                const isSelected = selectedTeachers.find((t) => t.teacher_id === teacher.id);
                const assignedRoom = teacherAssignments.get(teacher.id);
                const isAssignedElsewhere = !!assignedRoom;
                const hasAvailability = teacher.availability.includes(timeSlotId);
                const isDeleted = teacher.isDeleted || false;
                const isSelectedButUnavailable = isSelected && !hasAvailability && !isDeleted;
                const isSelectedButDeleted = isSelected && isDeleted;

                return (
                  <div
                    key={teacher.id}
                    className={`flex items-center gap-2 p-2 rounded ${
                      isSelectedButDeleted
                        ? 'bg-red-100 border-2 border-red-400'
                        : isSelectedButUnavailable
                        ? 'bg-orange-50 border border-orange-300'
                        : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      id={`teacher-${teacher.id}`}
                      checked={!!isSelected}
                      onChange={() => handleTeacherToggle(teacher.id)}
                      className="rounded"
                      disabled={isAssignedElsewhere && !isDeleted}
                    />
                    <label
                      htmlFor={`teacher-${teacher.id}`}
                      className={`flex-1 text-sm ${
                        isSelectedButDeleted
                          ? 'text-red-900 font-bold'
                          : isAssignedElsewhere
                          ? 'line-through text-gray-400'
                          : isSelectedButUnavailable
                          ? 'text-orange-900 font-semibold'
                          : ''
                      }`}
                      title={
                        isSelectedButDeleted
                          ? '⚠️ Teacher deleted - Please uncheck to remove'
                          : isSelectedButUnavailable
                          ? '⚠️ No longer available for this time slot - Please replace'
                          : isAssignedElsewhere
                          ? `Already assigned to Room ${assignedRoom}`
                          : ''
                      }
                    >
                      {isSelectedButDeleted && <span className="text-red-600">🗑️ </span>}
                      {isSelectedButUnavailable && <span className="text-orange-600">⚠️ </span>}
                      <span>{teacher.name}</span>
                      {isSelectedButDeleted && (
                        <span className="ml-1 text-xs text-red-600 font-bold no-underline">
                          (DELETED)
                        </span>
                      )}
                      {isSelectedButUnavailable && (
                        <span className="ml-1 text-xs text-orange-600 font-bold no-underline">
                          (UNAVAILABLE)
                        </span>
                      )}
                      {isAssignedElsewhere && !isDeleted && (
                        <span className="ml-1 text-xs text-red-600 font-semibold no-underline">
                          (Room {assignedRoom})
                        </span>
                      )}
                      {!isAssignedElsewhere && !isSelectedButUnavailable && !isDeleted && teacher.color_keyword && (
                        <span
                          className="ml-2 inline-block w-3 h-3 rounded-full"
                          style={{ backgroundColor: getColorForKeyword(teacher.color_keyword) }}
                        />
                      )}
                    </label>
                    {isSelected && !isDeleted && (
                      <button
                        onClick={() => handleSubstituteToggle(teacher.id)}
                        className={`text-xs px-2 py-1 rounded ${
                          isSelected.is_substitute
                            ? 'bg-yellow-200 text-yellow-800'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {isSelected.is_substitute ? 'SUB' : 'Regular'}
                      </button>
                    )}
                  </div>
                );
              })}
              </div>
            </div>

            {/* Students Selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">
                  Students (Max 5) - {assignmentType !== 'class'
                    ? <span className={assignmentType === 'online' ? 'text-cyan-600' : 'text-amber-600'}>
                        {assignmentType === 'online' ? 'ONLINE CLASS' : 'TASK'}
                      </span>
                    : `${selectedStudents.length}/5 selected`}
                </h3>
                <select
                  value={colorFilter}
                  onChange={(e) => setColorFilter(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="">All Colors</option>
                  <option value="red">Red</option>
                  <option value="blue">Blue</option>
                  <option value="green">Green</option>
                  <option value="yellow">Yellow</option>
                  <option value="purple">Purple</option>
                  <option value="orange">Orange</option>
                  <option value="pink">Pink</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto border border-gray-200 rounded p-3">
                {/* Special assignment type options */}
                <div
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer border-2 ${
                    assignmentType === 'online'
                      ? 'bg-cyan-100 border-cyan-400'
                      : 'border-transparent hover:bg-gray-50'
                  }`}
                  onClick={() => handleAssignmentTypeToggle('online')}
                >
                  <input
                    type="checkbox"
                    checked={assignmentType === 'online'}
                    onChange={() => handleAssignmentTypeToggle('online')}
                    className="rounded"
                  />
                  <span className="text-sm font-bold text-cyan-700">🖥️ ONLINE CLASS</span>
                </div>
                <div
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer border-2 ${
                    assignmentType === 'task'
                      ? 'bg-amber-100 border-amber-400'
                      : 'border-transparent hover:bg-gray-50'
                  }`}
                  onClick={() => handleAssignmentTypeToggle('task')}
                >
                  <input
                    type="checkbox"
                    checked={assignmentType === 'task'}
                    onChange={() => handleAssignmentTypeToggle('task')}
                    className="rounded"
                  />
                  <span className="text-sm font-bold text-amber-700">📋 TASK</span>
                </div>
                <hr className="border-gray-200 my-1" />
                {/* Regular students */}
                {studentsToShow.map((student) => {
                const isSelected = selectedStudents.find((s) => s.student_id === student.id);
                const assignedRoom = studentAssignments.get(student.id);
                const isAssignedElsewhere = !!assignedRoom;
                const hasAvailability = student.availability.includes(timeSlotId);
                const isDeleted = student.isDeleted || false;
                const isSelectedButUnavailable = isSelected && !hasAvailability && !isDeleted;
                const isSelectedButDeleted = isSelected && isDeleted;

                return (
                  <div
                    key={student.id}
                    className={`flex items-center gap-2 p-2 rounded ${
                      isSelectedButDeleted
                        ? 'bg-red-100 border-2 border-red-400'
                        : isSelectedButUnavailable
                        ? 'bg-orange-50 border border-orange-300'
                        : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      id={`student-${student.id}`}
                      checked={!!isSelected}
                      onChange={() => handleStudentToggle(student.id)}
                      className="rounded"
                      disabled={isAssignedElsewhere && !isDeleted}
                    />
                    <label
                      htmlFor={`student-${student.id}`}
                      className={`flex-1 text-sm ${
                        isSelectedButDeleted
                          ? 'text-red-900 font-bold'
                          : isAssignedElsewhere
                          ? 'line-through text-gray-400'
                          : isSelectedButUnavailable
                          ? 'text-orange-900 font-semibold'
                          : ''
                      }`}
                      title={
                        isSelectedButDeleted
                          ? '⚠️ Student deleted - Please uncheck to remove'
                          : isSelectedButUnavailable
                          ? '⚠️ No longer available for this time slot - Please replace'
                          : isAssignedElsewhere
                          ? `Already assigned to Room ${assignedRoom}`
                          : student.name
                      }
                    >
                      {isSelectedButDeleted && <span className="text-red-600">🗑️ </span>}
                      {isSelectedButUnavailable && <span className="text-orange-600">⚠️ </span>}
                      <span>{student.name}</span>
                      {isSelectedButDeleted && (
                        <span className="ml-1 text-xs text-red-600 font-bold no-underline">
                          (DELETED)
                        </span>
                      )}
                      {isSelectedButUnavailable && (
                        <span className="ml-1 text-xs text-orange-600 font-bold no-underline">
                          (UNAVAILABLE)
                        </span>
                      )}
                      {isAssignedElsewhere && !isDeleted && (
                        <span className="ml-1 text-xs text-red-600 font-semibold no-underline">
                          (Room {assignedRoom})
                        </span>
                      )}
                      {!isAssignedElsewhere && !isSelectedButUnavailable && !isDeleted && student.color_keyword && (
                        <span
                          className="ml-2 inline-block w-3 h-3 rounded-full"
                          style={{ backgroundColor: getColorForKeyword(student.color_keyword) }}
                        />
                      )}
                    </label>
                  </div>
                );
              })}
              </div>
            </div>
          </div>

          {/* Class/Books */}
          <div>
            <label htmlFor="notes" className="block text-sm font-semibold mb-2">
              Class/Books
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter class materials, books, or other information..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-4 flex items-center justify-between">
          <div>
            {existingAssignment && (
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to get color for keyword
function getColorForKeyword(keyword) {
  const colorMap = {
    red: '#ef4444',
    blue: '#3b82f6',
    green: '#10b981',
    yellow: '#eab308',
    purple: '#a855f7',
    orange: '#f97316',
    pink: '#ec4899',
  };
  return colorMap[keyword.toLowerCase()] || '#6b7280';
}

export default AssignmentModal;
