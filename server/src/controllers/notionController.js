import axios from 'axios';
import Teacher from '../models/Teacher.js';
import Student from '../models/Student.js';
import TimeSlot from '../models/TimeSlot.js';

// Map Notion START time values to time slot IDs (the slot that STARTS at this time)
const startTimeToSlotMap = {
  '8AM': 1, '8am': 1,      // 8AM-9AM slot
  '9AM': 2, '9am': 2,      // 9AM-10AM slot
  '10AM': 3, '10am': 3,    // 10AM-11AM slot
  '11AM': 4, '11am': 4,    // 11AM-12PM slot
  '1PM': 5, '1pm': 5,      // 1PM-2PM slot
  '2PM': 6, '2pm': 6,      // 2PM-3PM slot
  '3PM': 7, '3pm': 7,      // 3PM-4PM slot
  '4PM': 8, '4pm': 8,      // 4PM-5PM slot
  '5PM': 9, '5pm': 9,      // 5PM-6PM slot
  '6PM': 10, '6pm': 10,    // 6PM-7PM slot
  '7PM': 11, '7pm': 11,    // 7PM-8PM slot
  '8PM': 12, '8pm': 12     // 8PM-9PM slot
};

// Map Notion END time values to time slot IDs (the slot that ENDS at this time)
const endTimeToSlotMap = {
  '9AM': 1, '9am': 1,      // 8AM-9AM slot ends at 9AM
  '10AM': 2, '10am': 2,    // 9AM-10AM slot ends at 10AM
  '11AM': 3, '11am': 3,    // 10AM-11AM slot ends at 11AM
  '12PM': 4, '12pm': 4,    // 11AM-12PM slot ends at 12PM
  '1PM': 4, '1pm': 4,      // 11AM-12PM slot ends at 12PM (same as 12PM)
  '2PM': 5, '2pm': 5,      // 1PM-2PM slot ends at 2PM
  '3PM': 6, '3pm': 6,      // 2PM-3PM slot ends at 3PM
  '4PM': 7, '4pm': 7,      // 3PM-4PM slot ends at 4PM
  '5PM': 8, '5pm': 8,      // 4PM-5PM slot ends at 5PM
  '6PM': 9, '6pm': 9,      // 5PM-6PM slot ends at 6PM
  '7PM': 10, '7pm': 10,    // 6PM-7PM slot ends at 7PM
  '8PM': 11, '8pm': 11,    // 7PM-8PM slot ends at 8PM
  '9PM': 12, '9pm': 12     // 8PM-9PM slot ends at 9PM
};

// Preview teachers from Notion (doesn't import, just returns list)
export const previewTeachersFromNotion = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const notionApiKey = process.env.NOTION_API_KEY;
    const notionDatabaseId = process.env.NOTION_TEACHERS_DATABASE_ID;

    if (!notionApiKey || !notionDatabaseId) {
      return res.status(500).json({
        error: 'Notion API credentials not configured'
      });
    }

    // Query Notion database
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
      {
        filter: {
          property: 'Status',
          select: {
            equals: 'Active'
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${notionApiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );

    const data = response.data;
    const teachers = [];
    const errors = [];

    // Get existing teachers for this date to check for duplicates
    const existingTeachers = await Teacher.getAll(date);
    const existingNames = new Set(existingTeachers.map(t => t.name.toLowerCase()));

    for (const page of data.results) {
      try {
        const nickname = (page.properties.Nickname?.rich_text?.[0]?.plain_text || '').trim();
        const startTime = page.properties['Start Time']?.select?.name || '';
        const endTime = page.properties['End Time']?.select?.name || '';

        if (!nickname || !startTime || !endTime) {
          continue;
        }

        const startSlotId = startTimeToSlotMap[startTime];
        const endSlotId = endTimeToSlotMap[endTime];

        if (!startSlotId || !endSlotId) {
          continue;
        }

        const availability = [];
        for (let slotId = startSlotId; slotId <= endSlotId; slotId++) {
          availability.push(slotId);
        }

        teachers.push({
          notionId: page.id,
          name: nickname,
          startTime,
          endTime,
          availability,
          alreadyExists: existingNames.has(nickname.toLowerCase())
        });
      } catch (error) {
        errors.push(error.message);
      }
    }

    res.json({
      teachers,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Notion preview error:', error);
    res.status(500).json({
      error: 'Failed to preview from Notion',
      message: error.message
    });
  }
};

export const importTeachersFromNotion = async (req, res) => {
  try {
    const { date, selectedIds, skipDuplicates = true } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const notionApiKey = process.env.NOTION_API_KEY;
    const notionDatabaseId = process.env.NOTION_TEACHERS_DATABASE_ID;

    if (!notionApiKey || !notionDatabaseId) {
      return res.status(500).json({
        error: 'Notion API credentials not configured. Please add NOTION_API_KEY and NOTION_TEACHERS_DATABASE_ID to .env file'
      });
    }

    console.log(`\n=== Importing teachers from Notion for ${date} ===`);
    console.log(`Selected IDs: ${selectedIds ? selectedIds.length : 'ALL'}`);

    // Query the Notion database using direct REST API
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
      {
        filter: {
          property: 'Status',
          select: {
            equals: 'Active'
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${notionApiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );

    const data = response.data;

    console.log(`Found ${data.results.length} active teacher(s) in Notion`);

    // Filter by selected IDs if provided
    const pagesToProcess = selectedIds
      ? data.results.filter(page => selectedIds.includes(page.id))
      : data.results;

    console.log(`Processing ${pagesToProcess.length} teacher(s)`);

    // Debug: log the response to see what we're getting
    if (data.results.length === 0) {
      console.log('No results found. This could mean:');
      console.log('1. Integration is not connected to the database');
      console.log('2. No teachers have Status = "ACTIVE"');
      console.log('3. Database ID or property names are incorrect');
      console.log('\nTrying to query without filter to test connection...');

      // Test query without filter
      try {
        const testResponse = await axios.post(
          `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
          {},
          {
            headers: {
              'Authorization': `Bearer ${notionApiKey}`,
              'Notion-Version': '2022-06-28',
              'Content-Type': 'application/json'
            }
          }
        );
        console.log(`Test query found ${testResponse.data.results.length} total teacher(s) (without filter)`);

        if (testResponse.data.results.length > 0) {
          const firstPage = testResponse.data.results[0];
          console.log('\nSample teacher properties:');
          console.log('- Available properties:', Object.keys(firstPage.properties));
          if (firstPage.properties.Status) {
            console.log('- Status property:', firstPage.properties.Status);
          }
          if (firstPage.properties.Nickname) {
            console.log('- Nickname property:', firstPage.properties.Nickname);
          }
        }
      } catch (testError) {
        console.log('Test query failed:', testError.message);
      }
    }

    const createdTeachers = [];
    const updatedTeachers = [];
    const errors = [];

    for (const page of pagesToProcess) {
      try {
        // Extract properties
        const nickname = page.properties.Nickname?.rich_text?.[0]?.plain_text || '';
        const startTime = page.properties['Start Time']?.select?.name || '';
        const endTime = page.properties['End Time']?.select?.name || '';
        const status = page.properties.Status?.select?.name || '';

        if (!nickname) {
          errors.push(`Skipped teacher without nickname`);
          continue;
        }

        if (!startTime || !endTime) {
          errors.push(`Skipped ${nickname}: missing start or end time`);
          continue;
        }

        console.log(`\nProcessing: ${nickname}`);
        console.log(`  Start: ${startTime}, End: ${endTime}, Status: ${status}`);

        // Map start and end times to time slot IDs
        const startSlotId = startTimeToSlotMap[startTime];
        const endSlotId = endTimeToSlotMap[endTime];

        if (!startSlotId || !endSlotId) {
          errors.push(`${nickname}: Invalid time format (Start: ${startTime}, End: ${endTime})`);
          continue;
        }

        // Create availability array (all slots from start to end)
        const availability = [];
        for (let slotId = startSlotId; slotId <= endSlotId; slotId++) {
          availability.push(slotId);
        }

        console.log(`  Availability slots: ${availability.join(', ')}`);

        // Check if teacher already exists (including inactive)
        const existingTeacher = await Teacher.findByName(nickname, date);

        const teacherData = {
          name: nickname,
          availability: availability,
          color_keyword: 'blue', // default color
          date: date
        };

        let teacher;
        if (existingTeacher) {
          // Update and reactivate existing teacher
          teacher = await Teacher.reactivate(existingTeacher.id, teacherData);
          updatedTeachers.push({
            name: nickname,
            availability: `${startTime} to ${endTime}`,
            slots: availability.length
          });
          console.log(`  ↻ Updated/reactivated teacher: ${nickname} (ID: ${existingTeacher.id}, ${availability.length} slots)`);
        } else {
          // Create new teacher
          teacher = await Teacher.create(teacherData);
          createdTeachers.push({
            name: nickname,
            availability: `${startTime} to ${endTime}`,
            slots: availability.length
          });
          console.log(`  ✓ Created teacher: ${nickname} (${availability.length} slots)`);
        }

      } catch (error) {
        const teacherName = page.properties.Nickname?.rich_text?.[0]?.plain_text || 'Unknown';
        errors.push(`${teacherName}: ${error.message}`);
        console.error(`  ✗ Error processing ${teacherName}:`, error.message);
      }
    }

    console.log(`\n=== Import completed: ${createdTeachers.length} created, ${updatedTeachers.length} updated ===\n`);

    let message = `Successfully processed ${createdTeachers.length + updatedTeachers.length} teacher(s) from Notion`;
    if (createdTeachers.length > 0) {
      message += ` (${createdTeachers.length} new)`;
    }
    if (updatedTeachers.length > 0) {
      message += ` (${updatedTeachers.length} updated/reactivated)`;
    }

    res.json({
      message,
      created: createdTeachers.length,
      updated: updatedTeachers.length,
      teachers: createdTeachers,
      updatedTeachers: updatedTeachers.length > 0 ? updatedTeachers : undefined,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Notion import error:', error);
    res.status(500).json({
      error: 'Failed to import from Notion',
      message: error.message,
      details: error.code === 'object_not_found' ? 'Database not found or integration not connected' : undefined
    });
  }
};

// Get all active students from Notion (for Student Schedule Sheet dropdown)
export const getAllNotionStudents = async (req, res) => {
  try {
    const notionApiKey = process.env.NOTION_API_KEY;
    const notionDatabaseId = process.env.NOTION_STUDENTS_DATABASE_ID;

    if (!notionApiKey || !notionDatabaseId) {
      return res.status(500).json({
        error: 'Notion API credentials not configured'
      });
    }

    // Query the Notion database for active students only
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
      {
        filter: {
          property: 'Status',
          select: {
            equals: 'Active'
          }
        },
        sorts: [
          {
            property: 'Full Name',
            direction: 'ascending'
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${notionApiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );

    const students = response.data.results.map(page => ({
      notionId: page.id,
      name: page.properties['Full Name']?.title?.[0]?.plain_text || 'Unknown',
      englishName: page.properties['Full Name']?.title?.[0]?.plain_text || 'Unknown'
    }));

    res.json(students);
  } catch (error) {
    console.error('Error fetching Notion students:', error);
    res.status(500).json({
      error: 'Failed to fetch students from Notion',
      message: error.message
    });
  }
};

// Get single student details from Notion by Notion page ID
export const getNotionStudentById = async (req, res) => {
  try {
    const { notionId } = req.params;
    const notionApiKey = process.env.NOTION_API_KEY;

    if (!notionApiKey) {
      return res.status(500).json({
        error: 'Notion API credentials not configured'
      });
    }

    // Fetch the specific page from Notion
    const response = await axios.get(
      `https://api.notion.com/v1/pages/${notionId}`,
      {
        headers: {
          'Authorization': `Bearer ${notionApiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );

    const page = response.data;

    // DEBUG: Log all property names to see what's available
    console.log('\n=== Available Notion Properties ===');
    console.log(Object.keys(page.properties).join(', '));
    console.log('===================================\n');

    // Extract Student ID - try multiple formats since it could be different property types
    let studentId = '';
    const studentIdProp = page.properties['Student ID'];
    if (studentIdProp) {
      // Try Unique ID type (auto-generated)
      if (studentIdProp.unique_id) {
        studentId = studentIdProp.unique_id.prefix
          ? `${studentIdProp.unique_id.prefix}-${studentIdProp.unique_id.number}`
          : studentIdProp.unique_id.number?.toString() || '';
      }
      // Try Title type
      else if (studentIdProp.title && studentIdProp.title[0]) {
        studentId = studentIdProp.title[0].plain_text || '';
      }
      // Try Rich Text type
      else if (studentIdProp.rich_text && studentIdProp.rich_text[0]) {
        studentId = studentIdProp.rich_text[0].plain_text || '';
      }
      // Try Number type
      else if (studentIdProp.number !== undefined && studentIdProp.number !== null) {
        studentId = studentIdProp.number.toString();
      }
      // Try Formula type
      else if (studentIdProp.formula) {
        studentId = studentIdProp.formula.string || studentIdProp.formula.number?.toString() || '';
      }
    }

    // Extract Grade - try multiple formats
    let grade = '';
    const gradeProp = page.properties['Grade'];
    if (gradeProp) {
      // Try Select type (dropdown)
      if (gradeProp.select?.name) {
        grade = gradeProp.select.name;
      }
      // Try Title type
      else if (gradeProp.title && gradeProp.title[0]) {
        grade = gradeProp.title[0].plain_text || '';
      }
      // Try Rich Text type
      else if (gradeProp.rich_text && gradeProp.rich_text[0]) {
        grade = gradeProp.rich_text[0].plain_text || '';
      }
      // Try Number type
      else if (gradeProp.number !== undefined && gradeProp.number !== null) {
        grade = gradeProp.number.toString();
      }
      // Try Formula type
      else if (gradeProp.formula) {
        grade = gradeProp.formula.string || gradeProp.formula.number?.toString() || '';
      }
    }

    // Extract English Name - try multiple formats
    let englishName = '';

    // DEBUG: Log all available property names
    console.log('=== NOTION PROPERTIES DEBUG ===');
    console.log('Available properties:', Object.keys(page.properties));
    console.log('English Name property:', JSON.stringify(page.properties['English Name'], null, 2));
    console.log('==============================');

    const englishNameProp = page.properties['English Name'];
    if (englishNameProp) {
      if (englishNameProp.rich_text && englishNameProp.rich_text[0]) {
        englishName = englishNameProp.rich_text[0].plain_text || '';
      } else if (englishNameProp.title && englishNameProp.title[0]) {
        englishName = englishNameProp.title[0].plain_text || '';
      }
    }

    // Extract all student information
    const studentData = {
      notionId: page.id,
      // Basic info
      fullName: page.properties['Full Name']?.title?.[0]?.plain_text || '',
      englishName: englishName || 'N/A',
      studentId: studentId,
      gender: page.properties['Gender']?.select?.name || '',
      grade: grade,
      studentType: page.properties['Student Type']?.select?.name || '',
      // Schedule
      startTime: page.properties['Start Time']?.select?.name || '',
      endTime: page.properties['End Time']?.select?.name || '',
      // Program details
      school: page.properties['School']?.rich_text?.[0]?.plain_text || '',
      programStartDate: page.properties['Program Start']?.date?.start || '',
      programEndDate: page.properties['Program End']?.date?.start || '',
      // Level test scores (changed from number to text in Notion)
      reading: page.properties['Reading']?.rich_text?.[0]?.plain_text || '',
      grammar: page.properties['Grammar']?.rich_text?.[0]?.plain_text || '',
      vocabulary: page.properties['Vocabulary']?.rich_text?.[0]?.plain_text || '',
      listening: page.properties['Listening']?.rich_text?.[0]?.plain_text || '',
      writing: page.properties['Writing']?.rich_text?.[0]?.plain_text || '',
      levelTestTotal: page.properties['Level Test Total']?.rich_text?.[0]?.plain_text || '',
      icanMapTestLevel: page.properties['ICAN Map Test Level']?.rich_text?.[0]?.plain_text || '',
      // Reading level initial
      wpmInitial: page.properties['WPM Initial']?.number || '',
      gbwtInitial: page.properties['GBWT Initial']?.rich_text?.[0]?.plain_text || '',
      readingLevelInitial: page.properties['Reading Level Initial']?.rich_text?.[0]?.plain_text || '',
      // Reading level final
      wpmFinal: page.properties['WPM Final']?.number || '',
      gbwtFinal: page.properties['GBWT Final']?.rich_text?.[0]?.plain_text || '',
      readingLevelFinal: page.properties['Reading Level Final']?.rich_text?.[0]?.plain_text || '',
      // Interview scores (changed from number to text in Notion)
      interviewScore: page.properties['Interview Score']?.rich_text?.[0]?.plain_text || '',
      interviewScoreFinal: page.properties['Interview Score (Final)']?.rich_text?.[0]?.plain_text || ''
    };

    res.json(studentData);
  } catch (error) {
    console.error('Error fetching Notion student:', error);
    res.status(500).json({
      error: 'Failed to fetch student from Notion',
      message: error.message
    });
  }
};

// Preview students from Notion (doesn't import, just returns list)
export const previewStudentsFromNotion = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const notionApiKey = process.env.NOTION_API_KEY;
    const notionDatabaseId = process.env.NOTION_STUDENTS_DATABASE_ID;

    if (!notionApiKey || !notionDatabaseId) {
      return res.status(500).json({
        error: 'Notion API credentials not configured'
      });
    }

    // Query Notion database
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
      {
        filter: {
          property: 'Status',
          select: {
            equals: 'Active'
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${notionApiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );

    const data = response.data;
    const students = [];
    const errors = [];

    // Get existing students for this date to check for duplicates
    const existingStudents = await Student.getAll(date);
    const existingNames = new Set(existingStudents.map(s => s.name.toLowerCase()));

    for (const page of data.results) {
      try {
        const fullName = (page.properties['Full Name']?.title?.[0]?.plain_text || '').trim();
        const startTime = page.properties['Start Time']?.select?.name || '';
        const endTime = page.properties['End Time']?.select?.name || '';

        if (!fullName || !startTime || !endTime) {
          continue;
        }

        const startSlotId = startTimeToSlotMap[startTime];
        const endSlotId = endTimeToSlotMap[endTime];

        if (!startSlotId || !endSlotId) {
          continue;
        }

        const availability = [];
        for (let slotId = startSlotId; slotId <= endSlotId; slotId++) {
          availability.push(slotId);
        }

        // Extract Days Absent for preview
        const daysAbsent = (page.properties['Days Absent']?.multi_select || []).map(opt => opt.name);

        students.push({
          notionId: page.id,
          name: fullName,
          startTime,
          endTime,
          availability,
          daysAbsent,
          alreadyExists: existingNames.has(fullName.toLowerCase())
        });
      } catch (error) {
        errors.push(error.message);
      }
    }

    res.json({
      students,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Notion preview error:', error);
    res.status(500).json({
      error: 'Failed to preview from Notion',
      message: error.message
    });
  }
};

export const importStudentsFromNotion = async (req, res) => {
  try {
    const { date, selectedIds, skipDuplicates = true } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const notionApiKey = process.env.NOTION_API_KEY;
    const notionDatabaseId = process.env.NOTION_STUDENTS_DATABASE_ID;

    if (!notionApiKey || !notionDatabaseId) {
      return res.status(500).json({
        error: 'Notion API credentials not configured. Please add NOTION_API_KEY and NOTION_STUDENTS_DATABASE_ID to .env file'
      });
    }

    console.log(`\n=== Importing students from Notion for ${date} ===`);
    console.log(`Selected IDs: ${selectedIds ? selectedIds.length : 'ALL'}`);

    // Query the Notion database using direct REST API
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
      {
        filter: {
          property: 'Status',
          select: {
            equals: 'Active'
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${notionApiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );

    const data = response.data;

    console.log(`Found ${data.results.length} active student(s) in Notion`);

    // Filter by selected IDs if provided
    const pagesToProcess = selectedIds
      ? data.results.filter(page => selectedIds.includes(page.id))
      : data.results;

    console.log(`Processing ${pagesToProcess.length} student(s)`);

    const createdStudents = [];
    const updatedStudents = [];
    const errors = [];

    for (const page of pagesToProcess) {
      try {
        // Extract basic properties
        const fullName = (page.properties['Full Name']?.title?.[0]?.plain_text || '').trim();
        const startTime = page.properties['Start Time']?.select?.name || '';
        const endTime = page.properties['End Time']?.select?.name || '';
        const status = page.properties.Status?.select?.name || '';

        if (!fullName) {
          errors.push(`Skipped student without full name`);
          continue;
        }

        if (!startTime || !endTime) {
          errors.push(`Skipped ${fullName}: missing start or end time`);
          continue;
        }

        console.log(`\nProcessing: ${fullName}`);
        console.log(`  Start: ${startTime}, End: ${endTime}, Status: ${status}`);

        // Map start and end times to time slot IDs
        const startSlotId = startTimeToSlotMap[startTime];
        const endSlotId = endTimeToSlotMap[endTime];

        if (!startSlotId || !endSlotId) {
          errors.push(`${fullName}: Invalid time format (Start: ${startTime}, End: ${endTime})`);
          continue;
        }

        // Create availability array (all slots from start to end)
        const availability = [];
        for (let slotId = startSlotId; slotId <= endSlotId; slotId++) {
          availability.push(slotId);
        }

        console.log(`  Availability slots: ${availability.join(', ')}`);

        // Extract additional fields from Notion
        // Extract Student ID - try multiple formats
        let studentId = null;
        const studentIdProp = page.properties['Student ID'];
        if (studentIdProp) {
          if (studentIdProp.unique_id) {
            studentId = studentIdProp.unique_id.prefix
              ? `${studentIdProp.unique_id.prefix}-${studentIdProp.unique_id.number}`
              : studentIdProp.unique_id.number?.toString() || null;
          } else if (studentIdProp.title && studentIdProp.title[0]) {
            studentId = studentIdProp.title[0].plain_text || null;
          } else if (studentIdProp.rich_text && studentIdProp.rich_text[0]) {
            studentId = studentIdProp.rich_text[0].plain_text || null;
          } else if (studentIdProp.number !== undefined && studentIdProp.number !== null) {
            studentId = studentIdProp.number.toString();
          } else if (studentIdProp.formula) {
            studentId = studentIdProp.formula.string || studentIdProp.formula.number?.toString() || null;
          }
        }

        const gender = page.properties['Gender']?.select?.name || null;

        // Extract English Name - try multiple formats
        let englishName = null;

        const englishNameProp = page.properties['English Name'];
        if (englishNameProp) {
          if (englishNameProp.rich_text && englishNameProp.rich_text[0]) {
            englishName = englishNameProp.rich_text[0].plain_text || null;
          } else if (englishNameProp.title && englishNameProp.title[0]) {
            englishName = englishNameProp.title[0].plain_text || null;
          }
        }

        // Extract Grade - try multiple formats
        let grade = null;
        const gradeProp = page.properties['Grade'];
        if (gradeProp) {
          if (gradeProp.select?.name) {
            grade = gradeProp.select.name;
          } else if (gradeProp.title && gradeProp.title[0]) {
            grade = gradeProp.title[0].plain_text || null;
          } else if (gradeProp.rich_text && gradeProp.rich_text[0]) {
            grade = gradeProp.rich_text[0].plain_text || null;
          } else if (gradeProp.number !== undefined && gradeProp.number !== null) {
            grade = gradeProp.number.toString();
          } else if (gradeProp.formula) {
            grade = gradeProp.formula.string || gradeProp.formula.number?.toString() || null;
          }
        }

        const studentType = page.properties['Student Type']?.select?.name || null;

        // Extract assessment scores (changed from number to text in Notion)
        const readingScore = page.properties['Reading']?.rich_text?.[0]?.plain_text || null;
        const grammarScore = page.properties['Grammar']?.rich_text?.[0]?.plain_text || null;
        const vocabularyScore = page.properties['Vocabulary']?.rich_text?.[0]?.plain_text || null;
        const listeningScore = page.properties['Listening']?.rich_text?.[0]?.plain_text || null;
        const writingScore = page.properties['Writing']?.rich_text?.[0]?.plain_text || null;
        const levelTestTotal = page.properties['Level Test Total']?.rich_text?.[0]?.plain_text || null;

        // Extract reading level initial
        const wpmInitial = page.properties['WPM (Initial)']?.number || null;
        const gbwtInitial = page.properties['GBWT (Initial)']?.number || null;
        const readingLevelInitial = page.properties['Reading Level (Initial)']?.rich_text?.[0]?.plain_text || null;

        // Extract interview score (changed from number to text in Notion)
        const interviewScore = page.properties['Interview Score']?.rich_text?.[0]?.plain_text || null;

        // Extract Days Absent (multi-select of day names like "Monday", "Tuesday", etc.)
        const daysAbsent = (page.properties['Days Absent']?.multi_select || []).map(opt => opt.name);
        if (daysAbsent.length > 0) {
          console.log(`  Days Absent: ${daysAbsent.join(', ')}`);
        }

        // Check if student already exists (by Full Name, including inactive)
        const existingStudent = await Student.findByName(fullName, date);

        const studentData = {
          name: fullName,
          english_name: englishName,
          availability: availability,
          color_keyword: 'green', // default color
          weakness_level: null,
          teacher_notes: null,
          days_absent: daysAbsent,
          date: date,
          // Student information
          student_id: studentId,
          gender: gender,
          grade: grade,
          student_type: studentType,
          // Level test scores
          reading_score: readingScore,
          grammar_score: grammarScore,
          vocabulary_score: vocabularyScore,
          listening_score: listeningScore,
          writing_score: writingScore,
          level_test_total: levelTestTotal,
          // Reading level initial
          wpm_initial: wpmInitial,
          gbwt_initial: gbwtInitial,
          reading_level_initial: readingLevelInitial,
          // Interview score
          interview_score: interviewScore
        };

        let student;
        if (existingStudent) {
          // Update and reactivate existing student
          student = await Student.reactivate(existingStudent.id, studentData);
          updatedStudents.push({
            name: fullName,
            availability: `${startTime} to ${endTime}`,
            slots: availability.length
          });
          console.log(`  ↻ Updated/reactivated student: ${fullName} (ID: ${existingStudent.id}, ${availability.length} slots)`);
        } else {
          // Create new student
          student = await Student.create(studentData);
          createdStudents.push({
            name: fullName,
            availability: `${startTime} to ${endTime}`,
            slots: availability.length
          });
          console.log(`  ✓ Created student: ${fullName} (${availability.length} slots)`);
        }

      } catch (error) {
        const studentName = (page.properties['Full Name']?.title?.[0]?.plain_text || 'Unknown').trim();
        errors.push(`${studentName}: ${error.message}`);
        console.error(`  ✗ Error processing ${studentName}:`, error.message);
      }
    }

    console.log(`\n=== Import completed: ${createdStudents.length} created, ${updatedStudents.length} updated ===\n`);

    let message = `Successfully processed ${createdStudents.length + updatedStudents.length} student(s) from Notion`;
    if (createdStudents.length > 0) {
      message += ` (${createdStudents.length} new)`;
    }
    if (updatedStudents.length > 0) {
      message += ` (${updatedStudents.length} updated/reactivated)`;
    }

    res.json({
      message,
      created: createdStudents.length,
      updated: updatedStudents.length,
      students: createdStudents,
      updatedStudents: updatedStudents.length > 0 ? updatedStudents : undefined,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Notion import error:', error);
    res.status(500).json({
      error: 'Failed to import from Notion',
      message: error.message,
      details: error.code === 'object_not_found' ? 'Database not found or integration not connected' : undefined
    });
  }
};

// Update a specific field in a Notion student page
export const updateNotionStudent = async (req, res) => {
  try {
    const { notionId } = req.params;
    const { field, value } = req.body;

    if (!field || value === undefined) {
      return res.status(400).json({ error: 'field and value are required' });
    }

    const notionApiKey = process.env.NOTION_API_KEY;

    if (!notionApiKey) {
      return res.status(500).json({
        error: 'Notion API credentials not configured'
      });
    }

    // Map field names to Notion property names and construct the update payload
    const fieldPropertyMap = {
      school: 'School',
      programStartDate: 'Program Start',
      programEndDate: 'Program End',
      // Add more fields here if needed in the future
    };

    const notionPropertyName = fieldPropertyMap[field];
    if (!notionPropertyName) {
      return res.status(400).json({ error: `Field '${field}' is not supported for update` });
    }

    // Construct the properties object for the update
    const properties = {};

    // For rich_text fields (like School)
    if (field === 'school') {
      properties[notionPropertyName] = {
        rich_text: [
          {
            text: {
              content: value
            }
          }
        ]
      };
    }
    // For date fields (like Program Start, Program End)
    else if (field === 'programStartDate' || field === 'programEndDate') {
      // Notion expects date in ISO 8601 format: YYYY-MM-DD
      // If value is empty, set to null to clear the field
      properties[notionPropertyName] = {
        date: value ? {
          start: value // value should be in YYYY-MM-DD format
        } : null
      };
    }

    // Update the Notion page using PATCH
    const response = await axios.patch(
      `https://api.notion.com/v1/pages/${notionId}`,
      { properties },
      {
        headers: {
          'Authorization': `Bearer ${notionApiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      success: true,
      message: `Successfully updated ${field}`,
      data: response.data
    });

  } catch (error) {
    console.error('Error updating Notion student:', error.response?.data || error);
    res.status(500).json({
      error: 'Failed to update student in Notion',
      message: error.response?.data?.message || error.message
    });
  }
};
