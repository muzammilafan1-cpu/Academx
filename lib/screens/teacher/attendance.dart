import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {

  String? selectedClass;
  String? selectedSection;

  DateTime selectedDate = DateTime.now();

  final List<String> classes = [
    '1','2','3','4','5','6','7','8','9','10'
  ];

  final List<String> sections = ['A', 'B', 'C'];

  List<Map<String, dynamic>> students = [];
  Map<String, bool> attendance = {};

  bool loading = false;
  bool showStudents = false;
  bool saving = false;

  // 🔷 FORMAT DATE
  String formatDate(DateTime date) {
    return "${date.year}-${date.month.toString().padLeft(2,'0')}-${date.day.toString().padLeft(2,'0')}";
  }

  // 🔷 FETCH STUDENTS
  Future<void> fetchStudents() async {

    setState(() => loading = true);

    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final userDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get();

    final instId = userDoc.data()?['institutionId'];

    final snapshot = await FirebaseFirestore.instance
        .collection('institutions')
        .doc(instId)
        .collection('users')
        .where('role', isEqualTo: 'student')
        .where('class', isEqualTo: selectedClass)
        .where('section', isEqualTo: selectedSection)
        .get();

    students = snapshot.docs.map((doc) {
      return {
        'id': doc.id,
        'name': doc['name'],
      };
    }).toList();

    // ✅ default all present
    attendance.clear();
    for (var student in students) {
      attendance[student['id']] = true;
    }

    setState(() {
      loading = false;
      showStudents = true;
    });
  }

  // 🔥 SAVE ATTENDANCE
  Future<void> saveAttendance() async {

    setState(() => saving = true);

    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;

      final userDoc = await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .get();

      final instId = userDoc.data()?['institutionId'];

      final date = formatDate(selectedDate);

      final docId = "${instId}_${selectedClass}_${selectedSection}_$date";

      await FirebaseFirestore.instance
          .collection('attendance_v2')
          .doc(docId)
          .set({
        'institutionId': instId,
        'class': selectedClass,
        'section': selectedSection,
        'date': date,
        'markedBy': user.uid,
        'timestamp': FieldValue.serverTimestamp(),
        'students': attendance,
      });

      for (var entry in attendance.entries) {
        final studentId = entry.key;
        final isPresent = entry.value;

        await FirebaseFirestore.instance.collection('alerts').add({
          'institutionId': instId,
          'title': isPresent ? "Attendance Marked" : "Absent Alert",
          'message': isPresent
              ? "You were marked present today"
              : "You were marked absent today",
          'source': "attendance",
          'referenceId': docId,
          'targetRoles': ["student"],
          'targetUserId': studentId,
          'createdAt': FieldValue.serverTimestamp(),
          'read': false,
        });
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Attendance Saved Successfully")),
      );

    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Error: $e")),
      );
    }

    setState(() => saving = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Attendance")),

      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [

            // 🔷 CLASS
            DropdownButtonFormField<String>(
              decoration: const InputDecoration(labelText: "Select Class"),
              value: selectedClass,
              items: classes.map((cls) {
                return DropdownMenuItem(value: cls, child: Text(cls));
              }).toList(),
              onChanged: (value) {
                setState(() => selectedClass = value);
              },
            ),

            const SizedBox(height: 16),

            // 🔷 SECTION
            DropdownButtonFormField<String>(
              decoration: const InputDecoration(labelText: "Select Section"),
              value: selectedSection,
              items: sections.map((sec) {
                return DropdownMenuItem(value: sec, child: Text(sec));
              }).toList(),
              onChanged: (value) {
                setState(() => selectedSection = value);
              },
            ),

            const SizedBox(height: 16),

            // 🔷 DATE PICKER
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text("Select Date"),
              subtitle: Text(formatDate(selectedDate)),
              trailing: const Icon(Icons.calendar_today),
              onTap: () async {

                final picked = await showDatePicker(
                  context: context,
                  initialDate: selectedDate,
                  firstDate: DateTime(2020),
                  lastDate: DateTime.now(),
                );

                if (picked != null) {
                  setState(() => selectedDate = picked);
                }
              },
            ),

            const SizedBox(height: 20),

            // 🔷 LOAD BUTTON
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  if (selectedClass == null || selectedSection == null) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text("Select class and section")),
                    );
                    return;
                  }
                  fetchStudents();
                },
                child: const Text("Load Students"),
              ),
            ),

            const SizedBox(height: 20),

            if (loading)
              const CircularProgressIndicator(),

            if (showStudents && !loading)
              Expanded(
                child: Column(
                  children: [

                    Expanded(
                      child: ListView.builder(
                        itemCount: students.length,
                        itemBuilder: (context, index) {

                          final student = students[index];
                          final id = student['id'];

                          return Card(
                            margin: const EdgeInsets.symmetric(vertical: 6),
                            child: ListTile(
                              title: Text(student['name']),

                              trailing: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [

                                  // PRESENT
                                  GestureDetector(
                                    onTap: () {
                                      setState(() {
                                        attendance[id] = true;
                                      });
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                      margin: const EdgeInsets.only(right: 6),
                                      decoration: BoxDecoration(
                                        border: Border.all(color: Colors.black26),
                                        borderRadius: BorderRadius.circular(6),
                                        color: attendance[id] == true
                                            ? Colors.grey.shade300
                                            : Colors.transparent,
                                      ),
                                      child: const Text("Present"),
                                    ),
                                  ),

                                  // ABSENT
                                  GestureDetector(
                                    onTap: () {
                                      setState(() {
                                        attendance[id] = false;
                                      });
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                      decoration: BoxDecoration(
                                        border: Border.all(color: Colors.black26),
                                        borderRadius: BorderRadius.circular(6),
                                        color: attendance[id] == false
                                            ? Colors.grey.shade300
                                            : Colors.transparent,
                                      ),
                                      child: const Text("Absent"),
                                    ),
                                  ),

                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),

                    // 🔥 SAVE BUTTON
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: saving ? null : saveAttendance,
                        child: saving
                            ? const CircularProgressIndicator(color: Colors.white)
                            : const Text("Save Attendance"),
                      ),
                    ),

                  ],
                ),
              ),

          ],
        ),
      ),
    );
  }
}