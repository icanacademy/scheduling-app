import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import html2canvas from 'html2canvas';
import {
  getAllNotionStudents,
  getNotionStudentById,
  getAssignmentsByDateRange,
  getTimeSlots,
  getRooms,
  updateNotionStudent
} from '../services/api';

function StudentPrintPage() {
  const [selectedNotionId, setSelectedNotionId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [isEditingSchool, setIsEditingSchool] = useState(false);
  const [schoolValue, setSchoolValue] = useState('');
  const [isEditingProgramStart, setIsEditingProgramStart] = useState(false);
  const [programStartValue, setProgramStartValue] = useState('');
  const [isEditingProgramEnd, setIsEditingProgramEnd] = useState(false);
  const [programEndValue, setProgramEndValue] = useState('');
  const printRef = useRef(null);
  const queryClient = useQueryClient();

  // Fetch all active students from Notion
  const { data: notionStudents, isLoading: loadingStudents } = useQuery({
    queryKey: ['notionStudents'],
    queryFn: async () => {
      const response = await getAllNotionStudents();
      return response.data;
    },
  });

  // Fetch selected student details from Notion
  const { data: studentData, isLoading: loadingStudent } = useQuery({
    queryKey: ['notionStudent', selectedNotionId],
    queryFn: async () => {
      const response = await getNotionStudentById(selectedNotionId);
      return response.data;
    },
    enabled: !!selectedNotionId,
  });

  // Mutation to update student fields
  const updateFieldMutation = useMutation({
    mutationFn: async ({ notionId, field, value }) => {
      return await updateNotionStudent(notionId, field, value);
    },
    onSuccess: () => {
      // Invalidate and refetch student data
      queryClient.invalidateQueries(['notionStudent', selectedNotionId]);
    },
  });

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

  // Calculate date range: 60 days back, 60 days forward from today
  const today = new Date();
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(today.getDate() - 60);
  // Format date without timezone conversion
  const startDate = `${sixtyDaysAgo.getFullYear()}-${String(sixtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sixtyDaysAgo.getDate()).padStart(2, '0')}`;

  // Fetch assignments for date range (120 days total) when student is selected
  const { data: allAssignments } = useQuery({
    queryKey: ['assignmentsDateRange', startDate, selectedNotionId],
    queryFn: async () => {
      const response = await getAssignmentsByDateRange(startDate, 120);
      return response.data;
    },
    enabled: !!selectedNotionId,
  });

  // Filter assignments for this student by matching the student's name
  const studentAssignments = allAssignments?.filter(assignment => {
    if (!studentData) return false;
    // Check if student's name appears in the assignment's students array
    // Primary match: full name (most reliable, includes Korean characters)
    // Secondary match: assignment name matches english name, or assignment english name matches full name
    // NOTE: We do NOT match english_name to english_name alone, as multiple students can share
    // the same English name (e.g., multiple students named "John")
    return assignment.students?.some(s => {
      const assignmentName = (s.name || '').toLowerCase().trim();
      const assignmentEnglishName = (s.english_name || '').toLowerCase().trim();
      const notionFullName = (studentData.fullName || '').toLowerCase().trim();
      const notionEnglishName = (studentData.englishName || '').toLowerCase().trim();

      // Primary match: full names must match (most reliable)
      if (assignmentName === notionFullName) {
        return true;
      }

      // Secondary: assignment's full name contains the notion full name or vice versa
      // This handles cases where names might have slight variations
      if (notionFullName && assignmentName &&
          (assignmentName.includes(notionFullName) || notionFullName.includes(assignmentName))) {
        return true;
      }

      // Tertiary: Only match english name if assignment name is ONLY the english name
      // (no full name stored) - this is a fallback for legacy data
      if (assignmentName === notionEnglishName && !assignmentName.includes('[') && !assignmentName.includes('(')) {
        return true;
      }

      return false;
    });
  }) || [];

  // Debug: Log when a student is selected
  if (selectedNotionId && studentData && allAssignments) {
    console.log('Student Filter Debug:', {
      notionFullName: studentData.fullName,
      notionEnglishName: studentData.englishName,
      totalAssignments: allAssignments.length,
      matchedAssignments: studentAssignments.length,
      sampleAssignmentStudents: allAssignments.slice(0, 3).map(a => a.students)
    });
  }

  // Extract unique dates where student has classes
  const availableDates = [...new Set(studentAssignments.map(a => a.date.split('T')[0]))]
    .sort()
    .map(dateStr => {
      // Parse date components to avoid timezone issues
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return {
        value: dateStr,
        label: date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
      };
    });

  // Auto-select first available date when student is selected
  useEffect(() => {
    if (availableDates.length > 0 && !selectedDate) {
      setSelectedDate(availableDates[0].value);
    }
  }, [availableDates, selectedDate]);

  // Build schedule rows for selected date only
  const scheduleRows = studentAssignments
    .filter(assignment => {
      if (!selectedDate) return false;
      const assignmentDate = assignment.date.split('T')[0];
      return assignmentDate === selectedDate;
    })
    .map(assignment => {
      const timeSlot = timeSlots?.find(ts => ts.id === assignment.time_slot_id);
      const room = rooms?.find(r => r.id === assignment.room_id);
      const teachers = assignment.teachers?.map(t => t.name).join(', ') || '';

      return {
        time: timeSlot?.name || '',
        timeSlotId: timeSlot?.id,
        displayOrder: timeSlot?.display_order || 0,
        room: room?.name || '',
        teacher: teachers,
        books: assignment.notes || ''
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // Helper function to parse time range (e.g., "1PM to 2PM" -> ["1PM", "2PM"])
  const parseTimeRange = (timeStr) => {
    const parts = timeStr.split(' to ');
    if (parts.length === 2) {
      return { start: parts[0], end: parts[1] };
    }
    return { start: timeStr, end: timeStr };
  };

  // Merge consecutive rows with same room, teacher, and books
  const mergedScheduleRows = scheduleRows.reduce((merged, current, index) => {
    if (index === 0) {
      const { start, end } = parseTimeRange(current.time);
      return [{ ...current, startTime: start, endTime: end }];
    }

    const previous = merged[merged.length - 1];
    const canMerge =
      previous.room === current.room &&
      previous.teacher === current.teacher &&
      previous.books === current.books &&
      current.displayOrder === previous.displayOrder + 1; // Check if consecutive

    if (canMerge) {
      // Update the end time of the previous row to the end time of current row
      const { end } = parseTimeRange(current.time);
      previous.endTime = end;
      return merged;
    } else {
      // Add new row
      const { start, end } = parseTimeRange(current.time);
      return [...merged, { ...current, startTime: start, endTime: end }];
    }
  }, []);

  // Format time range for display
  const formattedScheduleRows = mergedScheduleRows.map(row => ({
    time: row.startTime === row.endTime ? row.startTime : `${row.startTime} to ${row.endTime}`,
    room: row.room,
    teacher: row.teacher,
    books: row.books
  }));

  // Calculate weeks between start and end date
  const calculateWeeks = (start, end) => {
    if (!start || !end) return '';
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.ceil(diffDays / 7);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadImage = async () => {
    if (!printRef.current) return;

    try {
      const element = printRef.current;

      // Simple screenshot with html2canvas
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      // Convert to blob and download
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const studentName = studentData?.fullName || 'student';
        const dateStr = selectedDate || new Date().toISOString().split('T')[0];
        link.download = `${studentName}_schedule_${dateStr}.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      });
    } catch (error) {
      console.error('Failed to download image:', error);
      alert('Failed to download image. Please try again.');
    }
  };

  // Reset date when student changes
  const handleStudentChange = (notionId) => {
    setSelectedNotionId(notionId);
    setSelectedDate(''); // Clear selected date when changing student
  };

  // Initialize field values when student data loads
  useEffect(() => {
    if (studentData) {
      setSchoolValue(studentData.school || '');
      setProgramStartValue(studentData.programStartDate || '');
      setProgramEndValue(studentData.programEndDate || '');
    }
  }, [studentData]);

  // Handle school field edit
  const handleSchoolEdit = () => {
    setIsEditingSchool(true);
  };

  const handleSchoolSave = async () => {
    if (schoolValue !== studentData?.school) {
      await updateFieldMutation.mutateAsync({
        notionId: selectedNotionId,
        field: 'school',
        value: schoolValue
      });
    }
    setIsEditingSchool(false);
  };

  const handleSchoolCancel = () => {
    setSchoolValue(studentData?.school || '');
    setIsEditingSchool(false);
  };

  const handleSchoolKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSchoolSave();
    } else if (e.key === 'Escape') {
      handleSchoolCancel();
    }
  };

  // Handle Program Start field edit
  const handleProgramStartEdit = () => {
    setIsEditingProgramStart(true);
  };

  const handleProgramStartSave = async () => {
    if (programStartValue !== studentData?.programStartDate) {
      await updateFieldMutation.mutateAsync({
        notionId: selectedNotionId,
        field: 'programStartDate',
        value: programStartValue // Already in YYYY-MM-DD format from date input
      });
    }
    setIsEditingProgramStart(false);
  };

  const handleProgramStartCancel = () => {
    setProgramStartValue(studentData?.programStartDate || '');
    setIsEditingProgramStart(false);
  };

  // Handle Program End field edit
  const handleProgramEndEdit = () => {
    setIsEditingProgramEnd(true);
  };

  const handleProgramEndSave = async () => {
    if (programEndValue !== studentData?.programEndDate) {
      await updateFieldMutation.mutateAsync({
        notionId: selectedNotionId,
        field: 'programEndDate',
        value: programEndValue // Already in YYYY-MM-DD format from date input
      });
    }
    setIsEditingProgramEnd(false);
  };

  const handleProgramEndCancel = () => {
    setProgramEndValue(studentData?.programEndDate || '');
    setIsEditingProgramEnd(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Print styles */}
      <style>{`
        @media print {
          @page {
            size: letter;
            margin: 0.5in;
          }

          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          /* Hide the app header and navigation */
          body > div > div > header {
            display: none !important;
          }

          /* Hide the main wrapper background and padding */
          body > div > div > main {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }

          /* Hide control panel */
          .print\\:hidden {
            display: none !important;
          }

          /* Make input/select look clean in print */
          input, select {
            border: none !important;
            background: transparent !important;
          }

          /* Ensure printable content takes proper space */
          .print-content {
            max-width: 100% !important;
            box-shadow: none !important;
            padding: 0 !important;
          }

          /* Remove hover effects in print */
          tr:hover {
            background: transparent !important;
          }
        }
      `}</style>

      {/* Control Panel - Hidden when printing */}
      <div className="print:hidden bg-white shadow-md p-6 mb-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Student Schedule Sheet</h1>

          <div className="flex gap-4 items-end mb-4">
            {/* Student Selector */}
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Select Student (from Notion)
              </label>
              <select
                value={selectedNotionId}
                onChange={(e) => handleStudentChange(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loadingStudents}
              >
                <option value="">-- Choose a student --</option>
                {notionStudents?.map(student => (
                  <option key={student.notionId} value={student.notionId}>
                    {student.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handlePrint}
                disabled={!selectedNotionId}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Schedule
              </button>
              <button
                onClick={handleDownloadImage}
                disabled={!selectedNotionId}
                className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download as Image
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Printable Content */}
      {selectedNotionId && studentData && (
        <div ref={printRef} className="w-full max-w-5xl mx-auto bg-white p-3 print-content">
          {/* Header */}
          <div className="text-center mb-2">
            <h1 className="text-xl font-bold text-blue-900">ICAN Academy - Student Schedule Sheet</h1>
            <div className="w-full h-0.5 bg-blue-600 mt-1"></div>
          </div>

          {/* Student Information & Program Details */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            {/* Student Information */}
            <div className="border-2 border-gray-300">
              <h3 className="text-xs font-bold bg-blue-100 px-2 py-1 border-b-2 border-gray-300">Student Information</h3>
              <div className="p-1.5">
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="h-5">
                      <td className="font-semibold w-24 align-top">Name:</td>
                      <td className="align-top">{studentData.fullName}</td>
                    </tr>
                    <tr className="h-5">
                      <td className="font-semibold align-top">English Name:</td>
                      <td className="align-top">{studentData.englishName || 'N/A'}</td>
                    </tr>
                    <tr className="h-5">
                      <td className="font-semibold align-top">Student ID:</td>
                      <td className="align-top">{studentData.studentId || 'N/A'}</td>
                    </tr>
                    <tr className="h-5">
                      <td className="font-semibold align-top">Gender:</td>
                      <td className="align-top">{studentData.gender || 'N/A'}</td>
                    </tr>
                    <tr className="h-5">
                      <td className="font-semibold align-top">Grade:</td>
                      <td className="align-top">{studentData.grade || 'N/A'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Program Details */}
            <div className="border-2 border-gray-300">
              <h3 className="text-xs font-bold bg-blue-100 px-2 py-1 border-b-2 border-gray-300">Program Details</h3>
              <div className="p-1.5">
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="h-5">
                      <td className="font-semibold w-24 align-top">Time:</td>
                      <td className="align-top">{studentData.startTime} - {studentData.endTime}</td>
                    </tr>
                    <tr className="h-5">
                      <td className="font-semibold align-top">School:</td>
                      <td className="align-top">
                        {isEditingSchool ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={schoolValue}
                              onChange={(e) => setSchoolValue(e.target.value)}
                              onKeyDown={handleSchoolKeyDown}
                              onBlur={handleSchoolSave}
                              autoFocus
                              className="flex-1 px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 print:border-0 print:bg-transparent"
                              disabled={updateFieldMutation.isPending}
                            />
                            {updateFieldMutation.isPending && (
                              <span className="text-xs text-gray-500 print:hidden">Saving...</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group">
                            <span>{studentData.school || 'N/A'}</span>
                            <button
                              onClick={handleSchoolEdit}
                              className="print:hidden opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 hover:text-blue-800 text-xs"
                              title="Click to edit school"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    <tr className="h-5">
                      <td className="font-semibold align-top">Program Start:</td>
                      <td className="align-top">
                        {isEditingProgramStart ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={programStartValue}
                              onChange={(e) => setProgramStartValue(e.target.value)}
                              onBlur={handleProgramStartSave}
                              autoFocus
                              className="flex-1 px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 print:border-0 print:bg-transparent"
                              disabled={updateFieldMutation.isPending}
                            />
                            {updateFieldMutation.isPending && (
                              <span className="text-xs text-gray-500 print:hidden">Saving...</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group">
                            <span>{studentData.programStartDate ? new Date(studentData.programStartDate).toLocaleDateString() : 'N/A'}</span>
                            <button
                              onClick={handleProgramStartEdit}
                              className="print:hidden opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 hover:text-blue-800 text-xs"
                              title="Click to edit program start date"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    <tr className="h-5">
                      <td className="font-semibold align-top">Program End:</td>
                      <td className="align-top">
                        {isEditingProgramEnd ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={programEndValue}
                              onChange={(e) => setProgramEndValue(e.target.value)}
                              onBlur={handleProgramEndSave}
                              autoFocus
                              className="flex-1 px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 print:border-0 print:bg-transparent"
                              disabled={updateFieldMutation.isPending}
                            />
                            {updateFieldMutation.isPending && (
                              <span className="text-xs text-gray-500 print:hidden">Saving...</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group">
                            <span>{studentData.programEndDate ? new Date(studentData.programEndDate).toLocaleDateString() : 'N/A'}</span>
                            <button
                              onClick={handleProgramEndEdit}
                              className="print:hidden opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 hover:text-blue-800 text-xs"
                              title="Click to edit program end date"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    <tr className="h-5">
                      <td className="font-semibold align-top">Weeks:</td>
                      <td className="align-top">{calculateWeeks(studentData.programStartDate, studentData.programEndDate) || 'N/A'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Assessment Scores */}
          <div className="border-2 border-gray-300 mb-2">
            <h3 className="text-xs font-bold bg-blue-100 px-2 py-1 border-b-2 border-gray-300">Assessment Scores</h3>
            <div className="p-1.5">
              <div className="grid grid-cols-2 gap-3">
                {/* Left Side: Level Test & Interview Scores */}
                <div>
                  {/* ICAN Map Test Level */}
                  <div className="text-xs font-semibold mb-1 text-gray-700">Level Test {studentData.icanMapTestLevel || '(TBD)'}</div>
                  <table className="w-full text-xs mb-2">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th className="text-center pb-1 font-semibold text-xs">Grammar</th>
                        <th className="text-center pb-1 font-semibold text-xs">Reading</th>
                        <th className="text-center pb-1 font-semibold text-xs">Vocab</th>
                        <th className="text-center pb-1 font-semibold text-xs">Listening</th>
                        <th className="text-center pb-1 font-semibold text-xs">Writing</th>
                        <th className="text-center pb-1 font-semibold text-xs">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="text-center pt-1 text-xs">{studentData.grammar || '-'}</td>
                        <td className="text-center pt-1 text-xs">{studentData.reading || '-'}</td>
                        <td className="text-center pt-1 text-xs">{studentData.vocabulary || '-'}</td>
                        <td className="text-center pt-1 text-xs">{studentData.listening || '-'}</td>
                        <td className="text-center pt-1 text-xs">{studentData.writing || '-'}</td>
                        <td className="text-center pt-1 font-bold text-xs">{studentData.levelTestTotal || '-'}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="text-xs font-semibold mb-1 text-gray-700">Interview Score</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th className="text-center pb-1 font-semibold text-xs">Initial</th>
                        <th className="text-center pb-1 font-semibold text-xs">Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="text-center pt-1 text-xs">{studentData.interviewScore || '-'}</td>
                        <td className="text-center pt-1 text-xs">{studentData.interviewScoreFinal || '-'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Right Side: Reading Level Initial & Final */}
                <div>
                  <div className="text-xs font-semibold mb-1 text-gray-700">Physical Reading Level (Initial)</div>
                  <table className="w-full text-xs mb-2">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th className="text-center pb-1 font-semibold text-xs">WPM</th>
                        <th className="text-center pb-1 font-semibold text-xs">GBWT</th>
                        <th className="text-center pb-1 font-semibold text-xs">Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="text-center pt-1 text-xs">{studentData.wpmInitial || '-'}</td>
                        <td className="text-center pt-1 text-xs">{studentData.gbwtInitial || '-'}</td>
                        <td className="text-center pt-1 text-xs">{studentData.readingLevelInitial || '-'}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="text-xs font-semibold mb-1 text-gray-700">Physical Reading Level (Final)</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th className="text-center pb-1 font-semibold text-xs">WPM</th>
                        <th className="text-center pb-1 font-semibold text-xs">GBWT</th>
                        <th className="text-center pb-1 font-semibold text-xs">Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="text-center pt-1 text-xs">{studentData.wpmFinal || '-'}</td>
                        <td className="text-center pt-1 text-xs">{studentData.gbwtFinal || '-'}</td>
                        <td className="text-center pt-1 text-xs">{studentData.readingLevelFinal || '-'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Class Schedule */}
          <div className="border-2 border-gray-300">
            <div className="bg-blue-100 px-2 py-1 border-b-2 border-gray-300 flex items-center gap-2">
              <h3 className="text-xs font-bold">Class Schedule for</h3>
              {availableDates.length > 0 ? (
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 print:border-0 print:bg-transparent"
                >
                  {availableDates.map(date => (
                    <option key={date.value} value={date.value}>
                      {date.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-gray-500 italic">No scheduled classes found</span>
              )}
            </div>

            {availableDates.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                This student has no scheduled classes in the past 60 days or next 60 days
              </div>
            ) : !selectedDate ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                Select a date above to view the class schedule
              </div>
            ) : formattedScheduleRows.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No classes scheduled for this date
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-1.5 py-0.5 font-semibold text-center w-[15%]">Time</th>
                    <th className="border border-gray-300 px-1.5 py-0.5 font-semibold text-center w-[8%]">Room</th>
                    <th className="border border-gray-300 px-1.5 py-0.5 font-semibold text-center w-[15%]">Teacher</th>
                    <th className="border border-gray-300 px-1.5 py-0.5 font-semibold text-center">Class/Books</th>
                  </tr>
                </thead>
                <tbody>
                  {formattedScheduleRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-1.5 py-0.5 text-center">{row.time}</td>
                      <td className="border border-gray-300 px-1.5 py-0.5 text-center">{row.room}</td>
                      <td className="border border-gray-300 px-1.5 py-0.5 text-center">{row.teacher}</td>
                      <td className="border border-gray-300 px-1.5 py-0.5 text-center">{row.books}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="mt-2 pt-1.5 border-t border-gray-300 text-center">
            <p className="text-xs text-gray-500">Generated: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!selectedNotionId && (
        <div className="max-w-4xl mx-auto text-center py-20">
          <div className="text-gray-400 mb-4">
            <svg className="w-24 h-24 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-2xl font-semibold text-gray-700 mb-2">Select a student and date</h3>
          <p className="text-gray-500">Choose a student from Notion and a schedule date to generate the schedule sheet</p>
        </div>
      )}
    </div>
  );
}

export default StudentPrintPage;
